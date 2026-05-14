"""Stage 4.5 — Hotspot, Model, and Media Merging.

Reads user-authored JSON manifest files and attaches the corresponding nodes
to the document tree.

---
Image hotspots (--hotspots):
[
  {"figure": "1.1", "x": 45, "y": 120, "w": 100, "h": 50,
   "target": "1.1.1", "text": "Front Section"},
  ...
]

---
3D model manifest (--models):
[
  { "id": "mdl_engine", "file": "models/engine_assembly.glb", "format": "glb",
    "section": "2.1", "title": "Engine Assembly",
    "meshHotspots": [
      { "meshName": "piston_1", "target": "2.1.3", "text": "Piston removal" }
    ]
  }
]

---
Media manifest (--media):
[
  { "type": "video", "id": "vid_3_2", "file": "media/demo.mp4",
    "title": "Procedure Demo", "section": "3.2" },
  { "type": "pdf",   "id": "pdf_4_1", "file": "media/annex_a.pdf",
    "title": "Wiring Annex", "section": "4.1" }
]
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional, Set, Union

from .models import (
    DocumentNode, FigureNode, HotspotNode, LeafGroup, LeafNode,
    MeshHotspotNode, Model3DNode, PdfNode, SectionNode, VideoNode,
)
from .utils import make_section_id


# ── Public API ────────────────────────────────────────────────────────────────

def merge(doc: DocumentNode, hotspots_path: str, ctx) -> None:
    """
    Load *hotspots_path*, validate, and attach hotspots to figures in *doc*.
    Mutates the tree in place.  If the file is missing or malformed, logs
    an error and returns without modifying the tree.
    """
    path = Path(hotspots_path)
    if not path.exists():
        ctx.warn("hotspot_merger", -1,
                 f"Hotspot file not found: {hotspots_path}", "ERROR")
        return

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        ctx.warn("hotspot_merger", -1,
                 f"Failed to load hotspot file: {exc}", "ERROR")
        return

    if not isinstance(data, list):
        ctx.warn("hotspot_merger", -1,
                 "Hotspot JSON must be a list of hotspot objects", "ERROR")
        return

    # 1. Group hotspots by figure number
    by_figure: Dict[str, List[dict]] = {}
    for entry in data:
        fig_num = str(entry.get("figure", "")).strip()
        if not fig_num:
            ctx.warn("hotspot_merger", -1,
                     f"Hotspot entry missing 'figure' key: {entry}", "WARNING")
            continue
        by_figure.setdefault(fig_num, []).append(entry)

    # 2. Collect all valid section IDs for validation
    valid_ids: Set[str] = _collect_section_ids(doc)

    # 3. Walk tree and attach hotspots
    matched_figures: Set[str] = set()
    doc_id = doc.doc_id or ""
    _attach_to_doc(doc, by_figure, valid_ids, matched_figures, ctx, doc_id)

    # 4. Warn about unmatched figure numbers
    for fig_num in by_figure:
        if fig_num not in matched_figures:
            ctx.warn("hotspot_merger", -1,
                     f"Hotspot figure '{fig_num}' did not match any figure in the document",
                     "WARNING")


# ── Public API — model manifest ───────────────────────────────────────────────

def merge_models(doc: DocumentNode, model_manifest_path: str, ctx) -> None:
    """
    Load *model_manifest_path* (JSON) and attach Model3DNode blocks to the
    matching sections in *doc*.  Mutates the tree in place.
    """
    path = Path(model_manifest_path)
    if not path.exists():
        ctx.warn("hotspot_merger", -1,
                 f"Model manifest not found: {model_manifest_path}", "ERROR")
        return

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        ctx.warn("hotspot_merger", -1,
                 f"Failed to load model manifest: {exc}", "ERROR")
        return

    if not isinstance(data, list):
        ctx.warn("hotspot_merger", -1,
                 "Model manifest JSON must be a list", "ERROR")
        return

    doc_id = doc.doc_id or ""
    for entry in data:
        section_num = str(entry.get("section", "")).strip()
        model_id    = str(entry.get("id", "")).strip()
        file_       = str(entry.get("file", "")).strip()
        fmt         = str(entry.get("format", "glb")).strip().lower()
        title       = str(entry.get("title", "")).strip()

        if not section_num or not file_:
            ctx.warn("hotspot_merger", -1,
                     f"Model entry missing 'section' or 'file': {entry}", "WARNING")
            continue

        if not model_id:
            model_id = "mdl_" + section_num.replace(".", "_")

        mesh_hotspots: List[MeshHotspotNode] = []
        for mh in entry.get("meshHotspots", []):
            mesh_name  = str(mh.get("meshName", "")).strip()
            raw_target = str(mh.get("target", "")).strip()
            text       = str(mh.get("text", "")).strip()
            if not mesh_name or not raw_target:
                continue
            target_id = make_section_id(raw_target, doc_id)
            mesh_hotspots.append(MeshHotspotNode(
                mesh_name=mesh_name, target=target_id, text=text,
            ))

        node = Model3DNode(
            id=model_id, file=file_, format=fmt, title=title,
            mesh_hotspots=mesh_hotspots,
        )

        target_sec = _find_section_by_number(doc, section_num)
        if target_sec is None:
            ctx.warn("hotspot_merger", -1,
                     f"Model section '{section_num}' not found in tree", "WARNING")
            continue
        target_sec.blocks.append(node)


# ── Public API — media manifest ────────────────────────────────────────────────

def merge_media(doc: DocumentNode, media_manifest_path: str, ctx) -> None:
    """
    Load *media_manifest_path* (JSON) and attach VideoNode / PdfNode blocks to
    the matching sections in *doc*.  Mutates the tree in place.
    """
    path = Path(media_manifest_path)
    if not path.exists():
        ctx.warn("hotspot_merger", -1,
                 f"Media manifest not found: {media_manifest_path}", "ERROR")
        return

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        ctx.warn("hotspot_merger", -1,
                 f"Failed to load media manifest: {exc}", "ERROR")
        return

    if not isinstance(data, list):
        ctx.warn("hotspot_merger", -1,
                 "Media manifest JSON must be a list", "ERROR")
        return

    _counters: Dict[str, int] = {"video": 0, "pdf": 0}
    for entry in data:
        media_type  = str(entry.get("type", "")).strip().lower()
        section_num = str(entry.get("section", "")).strip()
        file_       = str(entry.get("file", "")).strip()
        title       = str(entry.get("title", "")).strip()
        media_id    = str(entry.get("id", "")).strip()

        if media_type not in ("video", "pdf"):
            ctx.warn("hotspot_merger", -1,
                     f"Unknown media type '{media_type}' in manifest entry: {entry}",
                     "WARNING")
            continue

        if not section_num or not file_:
            ctx.warn("hotspot_merger", -1,
                     f"Media entry missing 'section' or 'file': {entry}", "WARNING")
            continue

        _counters[media_type] += 1
        if not media_id:
            prefix = "vid" if media_type == "video" else "pdf"
            media_id = f"{prefix}_{section_num.replace('.', '_')}"

        target_sec = _find_section_by_number(doc, section_num)
        if target_sec is None:
            ctx.warn("hotspot_merger", -1,
                     f"Media section '{section_num}' not found in tree", "WARNING")
            continue

        if media_type == "video":
            target_sec.blocks.append(VideoNode(id=media_id, file=file_, title=title))
        else:
            target_sec.blocks.append(PdfNode(id=media_id, file=file_, title=title))


# ── Shared tree helpers ───────────────────────────────────────────────────────

def _find_section_by_number(
    doc: DocumentNode, number: str
) -> Optional[Union[SectionNode, LeafNode]]:
    """Return the first SectionNode or LeafNode whose .number matches *number*."""
    for sec in doc.sections:
        result = _search_in_section(sec, number)
        if result:
            return result
    return None


def _search_in_section(
    sec: SectionNode, number: str
) -> Optional[Union[SectionNode, LeafNode]]:
    if sec.number == number:
        return sec
    for child in sec.children:
        if isinstance(child, SectionNode):
            result = _search_in_section(child, number)
            if result:
                return result
        elif isinstance(child, LeafGroup):
            result = _search_in_section(child.root_section, number)
            if result:
                return result
            for leaf in child.leaves:
                if leaf.number == number:
                    return leaf
    return None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _collect_section_ids(doc: DocumentNode) -> Set[str]:
    ids: Set[str] = set()
    for sec in doc.sections:
        _collect_ids_from_section(sec, ids)
    return ids


def _collect_ids_from_section(sec: SectionNode, ids: Set[str]) -> None:
    ids.add(sec.id)
    for child in sec.children:
        if isinstance(child, SectionNode):
            _collect_ids_from_section(child, ids)
        elif isinstance(child, LeafGroup):
            _collect_ids_from_section(child.root_section, ids)
            for leaf in child.leaves:
                ids.add(leaf.id)


def _attach_to_doc(doc, by_figure, valid_ids, matched_figures, ctx, doc_id="") -> None:
    for sec in doc.sections:
        _attach_to_section(sec, by_figure, valid_ids, matched_figures, ctx, doc_id)


def _attach_to_section(sec: SectionNode, by_figure, valid_ids, matched_figures, ctx, doc_id="") -> None:
    for block in sec.blocks:
        if isinstance(block, FigureNode):
            _attach_to_figure(block, by_figure, valid_ids, matched_figures, ctx, doc_id)
    for child in sec.children:
        if isinstance(child, SectionNode):
            _attach_to_section(child, by_figure, valid_ids, matched_figures, ctx, doc_id)
        elif isinstance(child, LeafGroup):
            _attach_to_section(child.root_section, by_figure, valid_ids, matched_figures, ctx, doc_id)
            for leaf in child.leaves:
                for block in leaf.blocks:
                    if isinstance(block, FigureNode):
                        _attach_to_figure(block, by_figure, valid_ids, matched_figures, ctx, doc_id)


def _attach_to_figure(
    fig: FigureNode,
    by_figure: Dict[str, List[dict]],
    valid_ids: Set[str],
    matched_figures: Set[str],
    ctx,
    doc_id: str = "",
) -> None:
    entries = by_figure.get(fig.number)
    if not entries:
        return

    matched_figures.add(fig.number)
    for entry in entries:
        try:
            x = int(entry["x"])
            y = int(entry["y"])
            w = int(entry["w"])
            h = int(entry["h"])
        except (KeyError, ValueError, TypeError) as exc:
            ctx.warn("hotspot_merger", -1,
                     f"Hotspot for figure '{fig.number}' has invalid x/y/w/h: {exc}",
                     "WARNING")
            continue

        target_num = str(entry.get("target", "")).strip()
        target_id  = make_section_id(target_num, doc_id) if target_num else ""
        label      = str(entry.get("label", "")).strip()
        desc       = str(entry.get("desc", "")).strip()
        text       = str(entry.get("text", label)).strip()  # fallback to label

        if target_id and target_id not in valid_ids:
            ctx.warn("hotspot_merger", -1,
                     f"Hotspot target '{target_num}' (→ '{target_id}') not found in tree",
                     "WARNING")

        fig.hotspots.append(HotspotNode(
            x=x, y=y, w=w, h=h,
            target=target_id,
            text=text,
            label=label,
            desc=desc,
        ))
