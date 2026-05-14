"""Multi-manual master registry.

Manages ietm_system/master.xml — a flat index of all converted manuals.

Operations:
  register(root, doc_id, title, rel_path)  — add / update entry
  unregister(root, doc_id)                 — remove entry
  list_manuals(root)                       — return list of dicts
"""

from __future__ import annotations

import datetime
import shutil
from pathlib import Path
from typing import Dict, List, Optional

from lxml import etree


MASTER_FILENAME = "master.xml"
GLOBAL_DIRNAME = "_global"

GLOBAL_ASSET_KINDS = {"prepages", "abbreviations"}


def register(
    ietm_root: Path,
    doc_id: str,
    title: str,
    rel_path: str,
) -> None:
    """Add or update a manual entry in master.xml."""
    master_path = Path(ietm_root) / MASTER_FILENAME
    root_el = _load_or_create(master_path)

    today = datetime.date.today().isoformat()

    # Find existing entry with same docId
    existing = root_el.find(f"manual[@docId='{doc_id}']")
    if existing is not None:
        existing.set("title",       title)
        existing.set("path",        rel_path)
        existing.set("updatedDate", today)
    else:
        manual = etree.SubElement(root_el, "manual")
        manual.set("docId",     doc_id)
        manual.set("title",     title)
        manual.set("path",      rel_path)
        manual.set("addedDate", today)

    _save(root_el, master_path)


def unregister(ietm_root: Path, doc_id: str) -> bool:
    """Remove a manual from master.xml.  Returns True if found and removed."""
    master_path = Path(ietm_root) / MASTER_FILENAME
    if not master_path.exists():
        return False

    root_el = _load_or_create(master_path)
    entry = root_el.find(f"manual[@docId='{doc_id}']")
    if entry is None:
        return False

    root_el.remove(entry)
    _save(root_el, master_path)
    return True


def register_global_asset(
    ietm_root: Path,
    kind: str,
    src_path: Path,
    title: Optional[str] = None,
) -> str:
    """Copy a global asset (prepages.pdf / abb.csv) into <root>/_global/ and
    upsert a `<global-assets>/<kind>` entry in master.xml.

    Returns the relative path written to master.xml (e.g. "_global/prepages.pdf").
    """
    if kind not in GLOBAL_ASSET_KINDS:
        raise ValueError(f"Unknown global asset kind: {kind!r}. "
                         f"Expected one of {sorted(GLOBAL_ASSET_KINDS)}.")
    src = Path(src_path)
    if not src.exists() or not src.is_file():
        raise FileNotFoundError(f"Global asset source not found: {src}")

    ietm_root = Path(ietm_root)
    global_dir = ietm_root / GLOBAL_DIRNAME
    global_dir.mkdir(parents=True, exist_ok=True)

    # Normalize destination filename so the frontend can rely on a stable name.
    dest_name = {"prepages": f"prepages{src.suffix.lower()}",
                 "abbreviations": f"abbreviations{src.suffix.lower()}"}[kind]
    dest = global_dir / dest_name
    shutil.copyfile(src, dest)

    rel_path = f"{GLOBAL_DIRNAME}/{dest_name}"

    master_path = ietm_root / MASTER_FILENAME
    root_el = _load_or_create(master_path)

    container = root_el.find("global-assets")
    if container is None:
        container = etree.SubElement(root_el, "global-assets")
        # Move container to the front so it precedes <manual> entries.
        root_el.insert(0, container)

    entry = container.find(kind)
    if entry is None:
        entry = etree.SubElement(container, kind)
    entry.set("file", rel_path)
    if title:
        entry.set("title", title)
    elif "title" not in entry.attrib:
        entry.set("title", kind.capitalize())
    entry.set("updatedDate", datetime.date.today().isoformat())

    _save(root_el, master_path)
    return rel_path


def unregister_global_asset(ietm_root: Path, kind: str) -> bool:
    """Remove a global asset entry (and its file). Returns True if removed."""
    if kind not in GLOBAL_ASSET_KINDS:
        raise ValueError(f"Unknown global asset kind: {kind!r}")

    ietm_root = Path(ietm_root)
    master_path = ietm_root / MASTER_FILENAME
    if not master_path.exists():
        return False

    root_el = _load_or_create(master_path)
    container = root_el.find("global-assets")
    if container is None:
        return False
    entry = container.find(kind)
    if entry is None:
        return False

    file_rel = entry.get("file")
    if file_rel:
        asset = ietm_root / file_rel
        if asset.exists():
            asset.unlink()

    container.remove(entry)
    if len(container) == 0:
        root_el.remove(container)
    _save(root_el, master_path)
    return True


def list_global_assets(ietm_root: Path) -> Dict[str, Dict[str, str]]:
    """Return {kind: {file, title, updatedDate}} for all registered global assets."""
    master_path = Path(ietm_root) / MASTER_FILENAME
    if not master_path.exists():
        return {}

    root_el = _load_or_create(master_path)
    container = root_el.find("global-assets")
    if container is None:
        return {}
    return {child.tag: dict(child.attrib) for child in container}


def list_manuals(ietm_root: Path) -> List[Dict[str, str]]:
    """Return a list of manual dicts from master.xml."""
    master_path = Path(ietm_root) / MASTER_FILENAME
    if not master_path.exists():
        return []

    root_el = _load_or_create(master_path)
    result = []
    for m in root_el.findall("manual"):
        result.append({k: v for k, v in m.attrib.items()})
    return result


# ── Internal helpers ──────────────────────────────────────────────────────────

def _load_or_create(master_path: Path) -> etree._Element:
    if master_path.exists():
        try:
            return etree.parse(str(master_path)).getroot()
        except etree.XMLSyntaxError:
            pass  # Recreate if corrupt

    root = etree.Element("ietm-master")
    root.set("version", "1.0")
    root.set("generatedDate", datetime.date.today().isoformat())
    return root


def _save(root_el: etree._Element, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tree = etree.ElementTree(root_el)
    with open(path, "wb") as f:
        tree.write(f, pretty_print=True, xml_declaration=True, encoding="UTF-8")
