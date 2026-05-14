"""Stage 2 — Content Classification.

A single forward pass over the flat element list.  Each element is assigned
one of these types and, where applicable, linked to its associated element
(e.g. image → caption, table → caption).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import List, Optional, Tuple

from .config import PipelineConfig
from .docx_reader import RawElement, RawParagraph, RawTable
from .models import FigureNode, TableNode
from .text_parser import plain_text
from .utils import normalize_whitespace, qn


class ElemType(Enum):
    SKIP         = auto()
    HEADING      = auto()
    FIGURE       = auto()
    TABLE        = auto()
    LIST_ITEM    = auto()
    PARAGRAPH    = auto()


@dataclass
class ClassifiedElement:
    elem_type: ElemType
    raw: RawElement

    # HEADING only
    heading_level: int = 0
    heading_title: str = ""

    # FIGURE only
    figure_number: str = ""
    figure_title:  str = ""
    image_filename: str = ""   # relative path to extracted image

    # TABLE only
    table_number: str  = ""
    table_title:  str  = ""

    # LIST_ITEM only
    list_label: str    = ""    # "a", "ii", "1", "" (bullet)
    list_type:  str    = ""    # "alpha", "roman", "numbered", "bullet"

    # PARAGRAPH: text is on raw.runs


# ── Public API ────────────────────────────────────────────────────────────────

def classify(
    elements: List[RawElement],
    image_map: dict,          # {rId: 'images/imageN.ext'}
    config: PipelineConfig,
    ctx,
) -> List[ClassifiedElement]:
    """
    Classify every element in *elements* and return ClassifiedElement list
    with SKIPs removed.
    """
    # Pre-compile patterns
    skip_style_set = {s.lower() for s in config.skip_styles}
    skip_text_res  = [re.compile(p) for p in config.skip_text_patterns]
    heading_re     = re.compile(config.heading_style_pattern)
    fig_cap_re     = re.compile(config.figure_caption_pattern, re.IGNORECASE | re.DOTALL)
    tbl_cap_re     = re.compile(config.table_caption_pattern,  re.IGNORECASE | re.DOTALL)
    alpha_re       = re.compile(config.alpha_list_pattern)
    roman_re       = re.compile(config.roman_list_pattern,  re.IGNORECASE)
    num_re         = re.compile(config.numeric_list_pattern)

    n = len(elements)
    used: List[bool] = [False] * n   # Elements consumed as part of a pair
    result: List[ClassifiedElement] = []

    i = 0
    while i < n:
        if used[i]:
            i += 1
            continue

        el = elements[i]

        # ── RawTable ──────────────────────────────────────────────────────────
        if isinstance(el, RawTable):
            # First: check if there is a figure caption nearby (before or after).
            # If so, this table is a composite figure (image grid) regardless of cell count.
            fig_num, fig_title, fig_cap_idx = _find_figure_caption(
                elements, i, fig_cap_re, config.figure_caption_max_lookahead,
                heading_re, used,
            )
            if not fig_num:
                fig_num, fig_title, fig_cap_idx = _find_figure_caption_before(
                    elements, i, fig_cap_re, config.figure_caption_max_lookahead, used
                )
            if fig_num:
                # Has a Figure caption — treat as a composite figure (image grid in table)
                tbl_img_rid = _find_image_rid_in_element(el.element)
                img_path = image_map.get(tbl_img_rid, "MISSING") if tbl_img_rid else "MISSING"
                if fig_cap_idx is not None:
                    used[fig_cap_idx] = True
                result.append(ClassifiedElement(
                    elem_type=ElemType.FIGURE,
                    raw=el,
                    figure_number=fig_num,
                    figure_title=fig_title,
                    image_filename=img_path,
                ))
                i += 1
                continue

            # No figure caption — check if it's a single-image figure-in-table wrapper.
            tbl_img_rid = _find_image_rid_in_element(el.element)
            if tbl_img_rid:
                img_path = image_map.get(tbl_img_rid, "MISSING")
                ctx.warn("classifier", i,
                         "Image-in-table has no caption — using placeholder", "WARNING")
                result.append(ClassifiedElement(
                    elem_type=ElemType.FIGURE,
                    raw=el,
                    figure_number=f"auto-{i}",
                    figure_title="[Untitled Figure]",
                    image_filename=img_path,
                ))
                i += 1
                continue

            # Normal table: look backward up to 3 positions for a Caption para
            caption_num, caption_title = _find_table_caption_before(
                elements, i, tbl_cap_re, used
            )
            ce = ClassifiedElement(
                elem_type=ElemType.TABLE,
                raw=el,
                table_number=caption_num,
                table_title=caption_title,
            )
            result.append(ce)
            i += 1
            continue

        # ── RawParagraph ──────────────────────────────────────────────────────
        assert isinstance(el, RawParagraph)
        style = el.style
        text  = normalize_whitespace(plain_text(el.runs))

        # 1. SKIP
        if _should_skip(style, text, skip_style_set, skip_text_res, el):
            i += 1
            continue

        # 2. HEADING
        m = heading_re.match(style)
        if m:
            level = int(m.group(1))
            if level < 1:
                level = 1
            if level > 9:
                ctx.warn("classifier", i, f"Heading level {level} > 9, clamping", "ERROR")
                level = 9
            title = text or "[Untitled Section]"
            result.append(ClassifiedElement(
                elem_type=ElemType.HEADING,
                raw=el,
                heading_level=level,
                heading_title=title,
            ))
            i += 1
            continue

        # 3. FIGURE (paragraph contains an embedded image)
        if el.image_rid:
            img_path = image_map.get(el.image_rid, "MISSING")
            # Try forward caption first (most common: caption below image)
            num, title, cap_idx = _find_figure_caption(
                elements, i, fig_cap_re, config.figure_caption_max_lookahead,
                heading_re, used
            )
            # Fall back to backward caption search (caption above image)
            if not num:
                num, title, cap_idx = _find_figure_caption_before(
                    elements, i, fig_cap_re, config.figure_caption_max_lookahead, used
                )
            if cap_idx is not None:
                used[cap_idx] = True
            if not num:
                ctx.warn("classifier", i, "Image has no caption — using placeholder", "WARNING")
            result.append(ClassifiedElement(
                elem_type=ElemType.FIGURE,
                raw=el,
                figure_number=num or f"auto-{i}",
                figure_title=title or "[Untitled Figure]",
                image_filename=img_path,
            ))
            i += 1
            continue

        # 4. TABLE CAPTION — if it directly precedes a RawTable, it will be
        #    consumed when that table is processed.  If it arrives here, the
        #    table was already consumed or the caption is orphaned.
        if style.lower() == config.caption_style.lower():
            m_fig = fig_cap_re.match(text)
            m_tbl = tbl_cap_re.match(text)
            if m_fig:
                # Orphaned figure caption — emit as paragraph
                ctx.warn("classifier", i, f"Caption '{text[:60]}' has no preceding image", "WARNING")
                result.append(ClassifiedElement(
                    elem_type=ElemType.PARAGRAPH, raw=el,
                ))
            elif m_tbl:
                # Will be consumed by the table processor; skip here
                i += 1
                continue
            else:
                result.append(ClassifiedElement(
                    elem_type=ElemType.PARAGRAPH, raw=el,
                ))
            i += 1
            continue

        # 5. LIST ITEM
        list_type, label = _detect_list(style, text, alpha_re, roman_re, num_re, el.element)
        if list_type:
            result.append(ClassifiedElement(
                elem_type=ElemType.LIST_ITEM,
                raw=el,
                list_label=label,
                list_type=list_type,
            ))
            i += 1
            continue

        # 6. PARAGRAPH (anything else with text)
        if text:
            result.append(ClassifiedElement(
                elem_type=ElemType.PARAGRAPH, raw=el,
            ))
        i += 1

    return result


# ── Helpers ───────────────────────────────────────────────────────────────────

def _should_skip(
    style: str,
    text: str,
    skip_style_set: set,
    skip_text_res: list,
    el: RawParagraph,
) -> bool:
    if style.lower() in skip_style_set:
        return True
    for rx in skip_text_res:
        if rx.search(text):
            return True
    # Empty paragraph with no image
    if not text and not el.image_rid:
        return True
    return False


def _find_figure_caption(
    elements: List[RawElement],
    img_idx: int,
    fig_cap_re,
    max_look: int,
    heading_re,
    used: List[bool],
) -> Tuple[str, str, Optional[int]]:
    """
    Scan forward from img_idx+1 for a figure caption.
    Returns (number, title, caption_index_or_None).
    Stops early if a heading is encountered.
    """
    n = len(elements)
    for j in range(img_idx + 1, min(img_idx + 1 + max_look, n)):
        if used[j]:
            continue
        el = elements[j]
        if isinstance(el, RawTable):
            break   # Hit a table, stop

        assert isinstance(el, RawParagraph)
        style = el.style
        text  = normalize_whitespace(plain_text(el.runs))

        # Stop if we hit a heading
        if heading_re.match(style):
            break

        # Caption style
        if style.lower().startswith("caption"):
            m = fig_cap_re.match(text)
            if m:
                return (m.group(1) or "").strip(), m.group(2).strip(), j

        # Paragraph whose text matches figure caption pattern
        m = fig_cap_re.match(text)
        if m:
            return (m.group(1) or "").strip(), m.group(2).strip(), j

        # Skip empty paragraphs silently; stop on non-empty non-caption paragraphs
        if text and not style.lower().startswith("caption"):
            # Non-empty, non-heading, non-caption content → stop search
            # (but don't break on the image para itself if it also has text)
            if j != img_idx:
                break

    return "", "", None


def _find_figure_caption_before(
    elements: List[RawElement],
    img_idx: int,
    fig_cap_re,
    max_look: int,
    used: List[bool],
) -> Tuple[str, str, Optional[int]]:
    """
    Scan backward from img_idx-1 for a figure caption (caption-above-image layout).
    Returns (number, title, caption_index_or_None).
    Stops early if a non-empty non-caption paragraph or a heading is encountered.
    """
    for j in range(img_idx - 1, max(img_idx - 1 - max_look, -1), -1):
        if used[j]:
            continue
        el = elements[j]
        if isinstance(el, RawTable):
            break

        assert isinstance(el, RawParagraph)
        style = el.style
        text  = normalize_whitespace(plain_text(el.runs))

        # Caption style match
        if style.lower().startswith("caption"):
            m = fig_cap_re.match(text)
            if m:
                return (m.group(1) or "").strip(), m.group(2).strip(), j

        # Plain text matching figure caption pattern
        m = fig_cap_re.match(text)
        if m:
            return (m.group(1) or "").strip(), m.group(2).strip(), j

        # Stop on non-empty content that isn't a caption
        if text:
            break

    return "", "", None


def _find_image_rid_in_element(element) -> Optional[str]:
    """
    Return an image rId only if the element looks like a single-image figure
    wrapped in a Word table border (one cell, no significant text alongside).
    Tables with text content in multiple cells are treated as real tables.
    """
    R_EMBED = qn("r", "embed")
    R_ID    = qn("r", "id")
    A_BLIP  = qn("a", "blip")
    V_IMG   = qn("v", "imagedata")
    W_TR    = qn("w", "tr")
    W_TC    = qn("w", "tc")
    W_T     = qn("w", "t")

    # Count rows and cells — a single-image wrapper has at most 1 row and 1 cell
    rows = element.findall(f".//{W_TR}")
    cells = element.findall(f".//{W_TC}")
    if len(rows) > 1 or len(cells) > 1:
        # Multi-row or multi-cell table — check if it has substantial text
        all_text = "".join(t.text or "" for t in element.iter(W_T)).strip()
        if all_text:
            return None  # Real table with text content

    blip = element.find(f".//{A_BLIP}")
    if blip is not None:
        rid = blip.get(R_EMBED) or blip.get(R_ID)
        if rid:
            return rid

    imgdata = element.find(f".//{V_IMG}")
    if imgdata is not None:
        rid = imgdata.get(R_ID) or imgdata.get(R_EMBED)
        if rid:
            return rid

    return None


def _find_table_caption_before(
    elements: List[RawElement],
    tbl_idx: int,
    tbl_cap_re,
    used: List[bool],
) -> Tuple[str, str]:
    """
    Look backward up to 3 positions for a table caption paragraph.
    Returns (number, title).
    """
    for j in range(tbl_idx - 1, max(tbl_idx - 4, -1), -1):
        if used[j]:
            continue
        el = elements[j]
        if not isinstance(el, RawParagraph):
            continue
        text = normalize_whitespace(plain_text(el.runs))
        m = tbl_cap_re.match(text)
        if m:
            used[j] = True
            return m.group(1).strip(), m.group(2).strip()
        # Stop at non-empty, non-whitespace paragraphs that don't match
        if text:
            break
    return "", ""


def _detect_list(
    style: str, text: str,
    alpha_re, roman_re, num_re,
    element=None,
) -> Tuple[str, str]:
    """
    Return (list_type_str, label) or ("", "") if not a list item.
    """
    # ListParagraph style with text → bullet only if w:numPr is present
    is_list_para = style.lower() in ("listparagraph", "list paragraph",
                                     "listparagraph1", "listwitha")

    m = alpha_re.match(text)
    if m:
        return "alpha", m.group(1).lower()

    m = roman_re.match(text)
    if m:
        # Distinguish roman from alpha: if label is a single letter a-h/j-z it's alpha
        label = m.group(1).lower()
        if label in ("i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
                     "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii",
                     "xix", "xx"):
            return "roman", label

    m = num_re.match(text)
    if m:
        return "numbered", m.group(1)

    # Only treat ListParagraph as bullet if w:numPr is present (actual Word list)
    if is_list_para and text and element is not None:
        ppr = element.find(qn("w", "pPr"))
        if ppr is not None and ppr.find(qn("w", "numPr")) is not None:
            return "bullet", ""

    return "", ""
