"""Shared constants, namespace maps, regex patterns, and ID/numbering helpers.

Uses only Python standard library — no third-party dependencies.
"""

from __future__ import annotations

import re
from typing import Dict

# ── OOXML Namespaces ──────────────────────────────────────────────────────────

NS: Dict[str, str] = {
    "w":   "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r":   "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "a":   "http://schemas.openxmlformats.org/drawingml/2006/main",
    "wp":  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "pic": "http://schemas.openxmlformats.org/drawingml/2006/picture",
    "v":   "urn:schemas-microsoft-com:vml",
    "dc":  "http://purl.org/dc/elements/1.1/",
    "cp":  "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

# Register namespaces so ElementTree doesn't mangle them on output
try:
    import xml.etree.ElementTree as ET
    for _prefix, _uri in NS.items():
        try:
            ET.register_namespace(_prefix, _uri)
        except Exception:
            pass
except Exception:
    pass


def qn(ns_prefix: str, local: str) -> str:
    """Clark-notation qualified name, e.g. qn('w', 'p') → '{...}p'."""
    return f"{{{NS[ns_prefix]}}}{local}"


# ── Regex helpers ─────────────────────────────────────────────────────────────

DOTTED_NUMBER_RE = re.compile(r"\d+(?:\.\d+)*")


def normalize_whitespace(text: str) -> str:
    """Collapse runs of whitespace to a single space and strip."""
    return re.sub(r"\s+", " ", text).strip()


# ── ID generation ─────────────────────────────────────────────────────────────

def make_section_id(number: str, doc_id: str = "") -> str:
    base = "sec_" + number.replace(".", "_")
    return f"{doc_id}_{base}" if doc_id else base


def make_figure_id(number: str, doc_id: str = "") -> str:
    base = "fig_" + number.replace(".", "_")
    return f"{doc_id}_{base}" if doc_id else base


def make_table_id(number: str, doc_id: str = "") -> str:
    base = "tbl_" + number.replace(".", "_")
    return f"{doc_id}_{base}" if doc_id else base


# ── Section numbering ─────────────────────────────────────────────────────────

def compute_child_number(parent_number: str, sibling_index: int) -> str:
    """
    Dotted section number from parent number and 0-based sibling index.
      parent="1.2", sibling_index=0  → "1.2.1"
      parent=""    , sibling_index=2  → "3"
    """
    child_part = str(sibling_index + 1)
    if parent_number:
        return f"{parent_number}.{child_part}"
    return child_part
