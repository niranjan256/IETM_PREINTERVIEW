"""Table parsing — converts a w:tbl lxml element into a TableNode.

Handles:
- Column count from w:tblGrid
- Horizontal merge: w:tcPr/w:gridSpan → CALS namest/nameend
- Vertical merge:   w:tcPr/w:vMerge  → CALS morerows
- Header row detection (first row, or rows with all-bold cells)
- Tables without captions (auto-generated IDs)
"""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

from lxml import etree

from .models import ListItemNode, ListNode, ListType, TableCell, TableNode, TableRow, TextRun
from .text_parser import extract_runs
from .utils import qn, NS


def parse_table(
    element,          # lxml w:tbl element
    table_id: str,
    table_number: str,
    table_title: str,
    config=None,
    image_map=None,
) -> TableNode:
    """Parse a w:tbl element into a TableNode."""

    W_TR    = qn("w", "tr")
    W_TC    = qn("w", "tc")
    W_TCPR  = qn("w", "tcPr")
    W_SPAN  = qn("w", "gridSpan")
    W_VMRG  = qn("w", "vMerge")
    W_TGRID = qn("w", "tblGrid")
    W_GCOL  = qn("w", "gridCol")
    W_VAL   = qn("w", "val")

    # ── Column count ──────────────────────────────────────────────────────────
    tgrid = element.find(W_TGRID)
    if tgrid is not None:
        col_count = len(tgrid.findall(W_GCOL))
    else:
        col_count = 1  # fallback

    # ── Parse rows ────────────────────────────────────────────────────────────
    raw_rows: List[List[dict]] = []   # list of rows; each row is list of cell-dicts

    for tr in element.findall(W_TR):
        row_cells: List[dict] = []
        for tc in tr.findall(W_TC):
            tcpr = tc.find(W_TCPR)

            # Horizontal span
            col_span = 1
            if tcpr is not None:
                span_el = tcpr.find(W_SPAN)
                if span_el is not None:
                    try:
                        col_span = int(span_el.get(W_VAL, "1"))
                    except (ValueError, TypeError):
                        col_span = 1

            # Vertical merge
            is_continuation = False
            is_restart = False
            if tcpr is not None:
                vmrg = tcpr.find(W_VMRG)
                if vmrg is not None:
                    val = vmrg.get(W_VAL, "")
                    if val == "restart":
                        is_restart = True
                    else:
                        # No val or val="" means continuation
                        is_continuation = True

            # Extract text runs (or a list) and images from all paragraphs inside the cell
            cell_runs, cell_list, cell_images = _parse_cell_content(tc, config, image_map)

            row_cells.append({
                "runs": cell_runs,
                "content_list": cell_list,
                "image_paths": cell_images,
                "col_span": col_span,
                "is_continuation": is_continuation,
                "is_restart": is_restart,
            })
        raw_rows.append(row_cells)

    # ── Compute row_span (morerows) for vertical merges ───────────────────────
    # For each restart cell, count how many continuation cells follow in the same
    # column position.
    # Build a 2D grid tracking which (row, col_pos) is occupied by a restart cell.

    # First pass: build (row_idx, col_pos) → cell_dict map
    cell_grid: dict = {}
    for r_idx, row in enumerate(raw_rows):
        col_pos = 0
        for cell in row:
            cell["_row"] = r_idx
            cell["_col"] = col_pos
            cell_grid[(r_idx, col_pos)] = cell
            col_pos += cell["col_span"]

    # Second pass: for each restart, count continuation cells below
    for r_idx, row in enumerate(raw_rows):
        for cell in row:
            if cell["is_restart"]:
                col_pos = cell["_col"]
                span = cell["col_span"]
                count = 0
                rr = r_idx + 1
                while rr < len(raw_rows):
                    # Check if the cell at same col in next row is a continuation
                    cont = cell_grid.get((rr, col_pos))
                    if cont and cont["is_continuation"]:
                        count += 1
                        rr += 1
                    else:
                        break
                cell["row_span"] = count + 1  # morerows + 1 = total rows spanned

    # ── Detect header row ─────────────────────────────────────────────────────
    header_row_count = 0
    if raw_rows:
        # Use first row as header if any cell has content (runs or list)
        first_row = raw_rows[0]
        if any(c["runs"] or c.get("content_list") for c in first_row):
            header_row_count = 1

    # ── Build TableRow / TableCell objects ────────────────────────────────────
    def _make_rows(row_dicts) -> List[TableRow]:
        rows = []
        for row in row_dicts:
            cells = []
            for c in row:
                if c["is_continuation"]:
                    cells.append(TableCell(
                        runs=[], is_continuation=True,
                        col_span=c["col_span"],
                        row_span=1,
                    ))
                else:
                    rs = c.get("row_span", 1)
                    cells.append(TableCell(
                        runs=c["runs"],
                        content_list=c.get("content_list"),
                        col_span=c["col_span"],
                        row_span=rs,
                        image_paths=c.get("image_paths", []),
                    ))
            rows.append(TableRow(cells=cells))
        return rows

    header_rows = _make_rows(raw_rows[:header_row_count])
    body_rows   = _make_rows(raw_rows[header_row_count:])

    # Pad short rows so all rows have col_count cells
    _pad_rows(header_rows, col_count)
    _pad_rows(body_rows,   col_count)

    return TableNode(
        id=table_id,
        number=table_number,
        title=table_title,
        col_count=col_count,
        header_rows=header_rows,
        body_rows=body_rows,
    )


def _pad_rows(rows: List[TableRow], col_count: int) -> None:
    """Pad rows that are shorter than col_count with empty cells."""
    for row in rows:
        current = sum(c.col_span for c in row.cells)
        while current < col_count:
            row.cells.append(TableCell(runs=[]))
            current += 1


# ── Cell list detection ───────────────────────────────────────────────────────

# (list_type_str, compiled_regex) ordered from most-specific to least
_CELL_LIST_PATTERNS: Optional[list] = None


def _get_cell_patterns(config) -> list:
    """
    Build (list_type_str, compiled_pattern) pairs from config.

    Roman patterns are tried BEFORE alpha patterns so that ambiguous single-char
    roman numerals (i, v, x, c, d, l, m) are correctly classified as roman rather
    than alpha.  Non-roman letters (a, b, e, f, ...) don't match the roman pattern
    so they fall through to alpha correctly.
    """
    pairs = []
    # With-parens — roman first, then alpha, then numbered
    for lt, attr in (("roman", "roman_list_pattern"),
                     ("alpha", "alpha_list_pattern"),
                     ("numbered", "numeric_list_pattern")):
        pat = getattr(config, attr, None)
        if pat:
            pairs.append((lt, re.compile(pat)))
    # Trailing-paren — roman first
    for lt, attr in (("roman", "roman_noparens_pattern"),
                     ("alpha", "alpha_noparens_pattern"),
                     ("numbered", "numeric_noparens_pattern")):
        pat = getattr(config, attr, None)
        if pat:
            pairs.append((lt, re.compile(pat)))
    # Dot-notation — roman first
    for lt, attr in (("roman", "roman_dot_pattern"),
                     ("alpha", "alpha_dot_pattern"),
                     ("numbered", "numeric_dot_pattern")):
        pat = getattr(config, attr, None)
        if pat:
            pairs.append((lt, re.compile(pat)))
    return pairs


def _detect_cell_list_item(
    text: str,
    config,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Try all list patterns against *text*.
    Returns (list_type_str, label, content_text) on match, else (None, None, None).
    """
    if config is None:
        return None, None, None
    for lt, pattern in _get_cell_patterns(config):
        m = pattern.match(text)
        if m:
            return lt, m.group(1), m.group(2).strip()
    return None, None, None


def _parse_cell_content(tc, config, image_map=None) -> Tuple[list, Optional[ListNode], list]:
    """
    Returns (runs, content_list, image_paths).

    If ALL non-empty paragraphs in the cell match a list pattern (and there are
    at least 2), returns ([], ListNode, image_paths).  Otherwise returns
    (merged_runs, None, image_paths).
    Mixed cells (some match, some don't) always fall back to merged_runs.
    """
    W_P = qn("w", "p")
    paras = [p for p in tc if p.tag == W_P]

    # ── Extract images from cell paragraphs ──────────────────────────────────
    image_paths: list = []
    if image_map:
        A_BLIP = qn("a", "blip")
        V_IMG = qn("v", "imagedata")
        R_EMBED = qn("r", "embed")
        R_ID = qn("r", "id")
        for para in paras:
            # Modern drawing (a:blip)
            blip = para.find(f".//{A_BLIP}")
            if blip is not None:
                rid = blip.get(R_EMBED) or blip.get(R_ID)
                if rid and rid in image_map:
                    image_paths.append(image_map[rid])
                    continue
            # Legacy VML (v:imagedata)
            imgdata = para.find(f".//{V_IMG}")
            if imgdata is not None:
                rid = imgdata.get(R_ID) or imgdata.get(R_EMBED)
                if rid and rid in image_map:
                    image_paths.append(image_map[rid])

    # ── Label-based list detection ───────────────────────────────────────────
    items = []
    for para in paras:
        runs = extract_runs(para)
        text = "".join(r.text for r in runs).strip()
        if not text:
            continue
        lt, label, content_text = _detect_cell_list_item(text, config)
        if lt:
            items.append((lt, label, [TextRun(text=content_text)]))
        else:
            items = None   # Mixed cell — bail out
            break

    if items and len(items) >= 2:
        list_type = ListType(items[0][0])
        list_items = [ListItemNode(label=lbl, runs=r) for _, lbl, r in items]
        return [], ListNode(list_type=list_type, items=list_items), image_paths

    # ── Bullet list detection (w:numPr) ──────────────────────────────────────
    W_PPR = qn("w", "pPr")
    W_NUMPR = qn("w", "numPr")
    bullet_items = []
    for para in paras:
        ppr = para.find(W_PPR)
        has_numpr = ppr is not None and ppr.find(W_NUMPR) is not None
        runs = extract_runs(para)
        text = "".join(r.text for r in runs).strip()
        if not text:
            continue
        if has_numpr:
            bullet_items.append(ListItemNode(label="", runs=runs))
        else:
            bullet_items = None
            break

    if bullet_items and len(bullet_items) >= 2:
        return [], ListNode(list_type=ListType.BULLET, items=bullet_items), image_paths

    # ── Fallback: concatenate all paragraphs with a space between them ───────
    all_runs: list = []
    for para in paras:
        r = extract_runs(para)
        if r and all_runs:
            all_runs.append(TextRun(text=" "))
        all_runs.extend(r)
    return all_runs, None, image_paths
