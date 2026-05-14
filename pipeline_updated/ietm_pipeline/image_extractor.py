"""Extract all images from the DOCX ZIP to the output images/ folder.

Browser-friendly formats (PNG, JPEG, GIF, WebP, SVG) are copied as-is.
Pillow-decodable legacy formats (TIFF, BMP, WDP/JXR, ICO, TGA) are converted to PNG.
WMF/EMF are converted via LibreOffice (soffice) if available, else kept with a warning.
Originals are preserved alongside as <name>.<ext>.original for authoring traceability.
"""

from __future__ import annotations

import shutil
import subprocess
import zipfile
from pathlib import Path
from typing import Dict

BROWSER_OK = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
PILLOW_CONVERT = {".tif", ".tiff", ".bmp", ".wdp", ".jxr", ".ico", ".tga"}
SOFFICE_CONVERT = {".wmf", ".emf"}


def _convert_with_pillow(src: Path, dst_png: Path, ctx) -> bool:
    try:
        from PIL import Image, UnidentifiedImageError  # type: ignore
    except ImportError:
        ctx.warn("image_extractor", -1,
                 "Pillow not installed; cannot convert legacy image formats", "ERROR")
        return False
    try:
        with Image.open(src) as im:
            if im.mode not in ("RGB", "RGBA", "L", "LA", "P"):
                im = im.convert("RGBA")
            im.save(dst_png, format="PNG")
        return True
    except UnidentifiedImageError:
        ctx.warn("image_extractor", -1,
                 f"Pillow could not identify image format: {src.name}", "WARN")
        return False
    except Exception as exc:
        ctx.warn("image_extractor", -1,
                 f"Pillow conversion failed for {src.name}: {exc}", "WARN")
        return False


def _convert_with_soffice(src: Path, images_dir: Path, ctx) -> bool:
    try:
        result = subprocess.run(
            ["soffice", "--headless", "--convert-to", "png",
             "--outdir", str(images_dir), str(src)],
            capture_output=True, timeout=30, text=True,
        )
        if result.returncode != 0:
            ctx.warn("image_extractor", -1,
                     f"soffice conversion failed for {src.name}: {result.stderr.strip()}",
                     "WARN")
            return False
        return (images_dir / f"{src.stem}.png").exists()
    except FileNotFoundError:
        ctx.warn("image_extractor", -1,
                 f"Install LibreOffice for WMF/EMF conversion ({src.name} kept as-is)",
                 "WARN")
        return False
    except subprocess.TimeoutExpired:
        ctx.warn("image_extractor", -1,
                 f"soffice timeout converting {src.name}", "WARN")
        return False


def _preserve_original(src: Path) -> None:
    """Rename src to src.name + '.original' so the PNG sibling can take the clean name."""
    backup = src.with_suffix(src.suffix + ".original")
    if backup.exists():
        backup.unlink()
    src.rename(backup)


def extract_all(
    zf: zipfile.ZipFile,
    rels_map: Dict[str, str],
    output_dir: Path,
    ctx,
) -> Dict[str, str]:
    """
    Copy every image referenced in *rels_map* to *output_dir/images/*.

    Legacy formats are converted to PNG when possible so that the final IETM
    can render them in a browser. The returned map always points at the
    browser-viewable file (PNG when converted, original otherwise).

    Args:
        zf:          Open ZipFile handle for the .docx
        rels_map:    {rId: 'media/imageN.ext'} from document.xml.rels
        output_dir:  Destination folder (manual's output directory)
        ctx:         PipelineContext for warnings

    Returns:
        {rId: 'images/imageN.<ext>'}  — relative paths for use in <graphic src>
    """
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    result: Dict[str, str] = {}
    names_in_zip = set(zf.namelist())

    for rid, media_path in rels_map.items():
        zip_path = f"word/{media_path}"
        if zip_path not in names_in_zip:
            ctx.warn("image_extractor", -1,
                     f"Image not found in ZIP: {zip_path} (rId={rid})", "ERROR")
            result[rid] = "MISSING"
            continue

        filename = Path(media_path).name
        dest = images_dir / filename
        ext = dest.suffix.lower()

        try:
            with zf.open(zip_path) as src, open(dest, "wb") as dst:
                shutil.copyfileobj(src, dst)
        except Exception as exc:
            ctx.warn("image_extractor", -1,
                     f"Failed to extract {zip_path}: {exc}", "ERROR")
            result[rid] = "MISSING"
            continue

        final_name = filename

        if ext in BROWSER_OK:
            pass
        elif ext in PILLOW_CONVERT:
            png_name = f"{dest.stem}.png"
            png_path = images_dir / png_name
            if _convert_with_pillow(dest, png_path, ctx):
                _preserve_original(dest)
                final_name = png_name
        elif ext in SOFFICE_CONVERT:
            png_name = f"{dest.stem}.png"
            png_path = images_dir / png_name
            if _convert_with_soffice(dest, images_dir, ctx):
                _preserve_original(dest)
                final_name = png_name
            else:
                # LibreOffice unavailable — try Pillow as a last resort (handles
                # some simple WMF/EMF files via the wand/imagemagick backend if
                # available, silently no-ops otherwise)
                if _convert_with_pillow(dest, png_path, ctx):
                    _preserve_original(dest)
                    final_name = png_name
                else:
                    ctx.warn("image_extractor", -1,
                             f"{dest.name!r} is WMF/EMF and could not be converted — "
                             f"install LibreOffice for full support. "
                             f"File kept as {ext} (will not render in browser).",
                             "WARN")
        else:
            # Unknown extension — try Pillow as a best effort, otherwise leave alone.
            png_name = f"{dest.stem}.png"
            png_path = images_dir / png_name
            if _convert_with_pillow(dest, png_path, ctx):
                _preserve_original(dest)
                final_name = png_name

        result[rid] = f"images/{final_name}"

    return result
