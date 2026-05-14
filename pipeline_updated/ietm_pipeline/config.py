"""Pipeline configuration — all document-detection patterns in one place.

To adapt the pipeline for a different document convention, only this file
needs to change (or override values at runtime via CLI flags).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

# ── Security / access-control patterns ───────────────────────────────────────
# Matches [UNCLASSIFIED], [SECRET], [TOP SECRET] etc. inside heading text
SECURITY_MARKER_RE = re.compile(
    r'\[(UNCLASSIFIED|RESTRICTED|CONFIDENTIAL|SECRET|TOP\s+SECRET)\]', re.I
)
# Matches any all-caps group token like [ARMAMENT], [AVIONICS], [MAINT] etc.
# Used after SECURITY_MARKER_RE to capture remaining bracketed tokens as group names
ACCESS_GROUP_RE = re.compile(r'\[([A-Z][A-Z0-9_]{1,})\]')


@dataclass
class PipelineConfig:

    # ── Styles to skip entirely (case-insensitive comparison) ─────────────────
    skip_styles: List[str] = field(default_factory=lambda: [
        "TableofFigures", "TOC1", "TOC2", "TOC3", "TOC4",
        "TOC5", "TOC6", "TOC7", "TOC8", "TOC9",
        "Header", "Footer",
    ])

    # ── Full-text regex patterns that mark a paragraph for skipping ───────────
    skip_text_patterns: List[str] = field(default_factory=lambda: [
        r"(?i)^PART\s*[-\u2013]?\s*[IVXLCDM]+\s*$",
        r"(?i)this page is intentionally left blank",
    ])

    # ── Caption style name ────────────────────────────────────────────────────
    caption_style: str = "Caption"

    # ── Heading style detection — capture group 1 must be the level digit ─────
    heading_style_pattern: str = r"^Heading(\d)$"

    # ── Caption number/title extraction ───────────────────────────────────────
    figure_caption_pattern: str = r"(?i)Figure\s*\.?\s*(\d+(?:\.\d+)*)?\s*\.?\s*(.*)"
    table_caption_pattern:  str = r"(?i)Table\s*(\d+(?:\.\d+)*)\s*(.*)"

    # ── Cross-reference detection inside body text ────────────────────────────
    xref_pattern: str = r"(Figure|Table)\s*(\d+(?:\.\d+)*)"

    # ── Manual list detection ((a), (i), (1) style) ───────────────────────────
    alpha_list_pattern:   str = r"^\s*\(([a-z])\)\s*(.+)"
    roman_list_pattern:   str = r"(?i)^\s*\(([ivxlcdm]+)\)\s*(.+)"
    numeric_list_pattern: str = r"^\s*\((\d+)\)\s*(.+)"

    # ── Extended list patterns (trailing-paren and dot notation) ──────────────
    # Trailing-parenthesis: a)  i)  1)
    alpha_noparens_pattern:   str = r"^\s*([a-z])\)\s+(.+)"
    roman_noparens_pattern:   str = r"(?i)^\s*([ivxlcdm]+)\)\s+(.+)"
    numeric_noparens_pattern: str = r"^\s*(\d+)\)\s+(.+)"
    # Dot-notation: a.  i.  1.
    alpha_dot_pattern:        str = r"^\s*([a-z])\.\s+(.+)"
    roman_dot_pattern:        str = r"(?i)^\s*([ivxlcdm]+)\.\s+(.+)"
    numeric_dot_pattern:      str = r"^\s*(\d+)\.\s+(.+)"

    # ── Figure-caption scan limit ─────────────────────────────────────────────
    # Scan stops early if a heading is encountered regardless of this limit
    figure_caption_max_lookahead: int = 10

    # ── Document metadata overrides (None = auto-detect from docProps) ────────
    doc_id: Optional[str] = None
    title:  Optional[str] = None
    classification: str = "UNCLASSIFIED"

    # ── Access control defaults ────────────────────────────────────────────────
    # Comma-separated group names applied to all sections (unless overridden by
    # heading markers like [ARMAMENT]).  "all" means no restriction.
    access_groups: str = "all"
