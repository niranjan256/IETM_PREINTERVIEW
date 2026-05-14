"""Stage 1 — DOCX Reading.

Opens the .docx ZIP, parses word/document.xml into a flat list of
RawParagraph / RawTable objects, extracts relationship maps, and copies
images to the output folder.
"""

from __future__ import annotations

import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

from lxml import etree

from . import image_extractor
from .config import PipelineConfig
from .text_parser import extract_runs, TextRun
from .utils import NS, qn


# ── Raw element types ─────────────────────────────────────────────────────────

@dataclass
class RawParagraph:
    index: int                          # Position in the flat body list
    style: str                          # e.g. "Heading1", "Caption", "Normal"
    runs: List[TextRun]                 # Merged text runs (from text_parser)
    image_rid: Optional[str] = None     # rId of embedded image, if any
    element: object = field(default=None, repr=False)  # lxml element (for table_parser)


@dataclass
class RawTable:
    index: int
    element: object = field(default=None, repr=False)   # lxml w:tbl element


RawElement = Union[RawParagraph, RawTable]


# ── Metadata extracted from docProps ─────────────────────────────────────────

@dataclass
class DocMetadata:
    title: str = ""
    subject: str = ""


# ── Public API ────────────────────────────────────────────────────────────────

def read(
    docx_path: str,
    output_dir: Path,
    config: PipelineConfig,
    ctx,
) -> Tuple[List[RawElement], Dict[str, str], DocMetadata]:
    """
    Parse the .docx file.

    Returns:
        elements  — flat ordered list of RawParagraph / RawTable
        image_map — {rId: 'images/imageN.ext'} (images copied to output_dir)
        metadata  — title / subject from docProps
    """
    with zipfile.ZipFile(docx_path, "r") as zf:
        # 1. Relationship map
        rels_raw = _parse_rels(zf)
        # Filter to image relationships only
        image_rels = {
            rid: path for rid, path in rels_raw.items()
            if path.startswith("media/")
        }

        # 2. Extract images
        image_map = image_extractor.extract_all(zf, image_rels, output_dir, ctx)

        # 3. Parse document body
        doc_xml = zf.read("word/document.xml")
        elements = _parse_body(doc_xml, image_map, ctx)

        # 4. Document metadata
        metadata = _parse_metadata(zf)

    return elements, image_map, metadata


# ── Internal helpers ──────────────────────────────────────────────────────────

def _parse_rels(zf: zipfile.ZipFile) -> Dict[str, str]:
    """Parse word/_rels/document.xml.rels → {rId: target_path}."""
    rels_path = "word/_rels/document.xml.rels"
    if rels_path not in zf.namelist():
        return {}
    xml = zf.read(rels_path)
    root = etree.fromstring(xml)

    result: Dict[str, str] = {}
    for rel in root:
        rid    = rel.get("Id", "")
        target = rel.get("Target", "")
        if rid and target:
            result[rid] = target
    return result


def _parse_body(
    doc_xml: bytes,
    image_map: Dict[str, str],
    ctx,
) -> List[RawElement]:
    """Walk w:body children and build the flat element list."""
    root   = etree.fromstring(doc_xml)
    body   = root.find(qn("w", "body"))
    if body is None:
        ctx.warn("docx_reader", -1, "No w:body found in document.xml", "ERROR")
        return []

    W_P      = qn("w", "p")
    W_TBL    = qn("w", "tbl")
    W_PSTYLE = qn("w", "pStyle")
    W_PPR    = qn("w", "pPr")
    W_VAL    = qn("w", "val")

    elements: List[RawElement] = []
    idx = 0

    for child in body:
        tag = child.tag

        if tag == W_P:
            # Extract style
            ppr  = child.find(W_PPR)
            style_el = ppr.find(W_PSTYLE) if ppr is not None else None
            style = style_el.get(W_VAL, "Normal") if style_el is not None else "Normal"

            # Extract runs
            runs = extract_runs(child)

            # Detect embedded image (a:blip inside paragraph)
            image_rid = _find_image_rid(child)

            elements.append(RawParagraph(
                index=idx,
                style=style,
                runs=runs,
                image_rid=image_rid,
                element=child,
            ))
            idx += 1

        elif tag == W_TBL:
            elements.append(RawTable(index=idx, element=child))
            idx += 1
        # Skip w:bookmarkStart, w:bookmarkEnd, w:sectPr, etc.

    return elements


def _find_image_rid(para_element) -> Optional[str]:
    """
    Return the relationship ID of the first image blip inside a paragraph.

    Handles both:
    - Modern drawing:  a:blip r:embed="rId9"
    - Legacy VML:      v:imagedata r:id="rId9"
    """
    R_EMBED = qn("r", "embed")
    R_ID    = qn("r", "id")
    A_BLIP  = qn("a", "blip")
    V_IMG   = qn("v", "imagedata")

    # Modern drawing (most common)
    blip = para_element.find(f".//{A_BLIP}")
    if blip is not None:
        rid = blip.get(R_EMBED) or blip.get(R_ID)
        if rid:
            return rid

    # Legacy VML
    imgdata = para_element.find(f".//{V_IMG}")
    if imgdata is not None:
        rid = imgdata.get(R_ID) or imgdata.get(R_EMBED)
        if rid:
            return rid

    return None


def _parse_metadata(zf: zipfile.ZipFile) -> DocMetadata:
    """Extract title and subject from docProps/core.xml."""
    meta = DocMetadata()
    core_path = "docProps/core.xml"
    if core_path not in zf.namelist():
        return meta

    try:
        xml  = zf.read(core_path)
        root = etree.fromstring(xml)

        DC_TITLE   = qn("dc", "title")
        DC_SUBJECT = qn("dc", "subject")

        title_el = root.find(f".//{DC_TITLE}")
        if title_el is not None and title_el.text:
            meta.title = title_el.text.strip()

        subj_el = root.find(f".//{DC_SUBJECT}")
        if subj_el is not None and subj_el.text:
            meta.subject = subj_el.text.strip()
    except Exception:
        pass

    return meta
