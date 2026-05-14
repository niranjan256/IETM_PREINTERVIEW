"""Run-level text extraction from a w:p element.

Extracts text runs with their inline formatting (bold, italic, underline)
and merges adjacent runs that have identical formatting — Word splits text
arbitrarily across runs (e.g. "T" + "his paragraph") and merging them
makes text analysis reliable.
"""

from __future__ import annotations

from typing import List

from lxml import etree

from .models import TextRun
from .utils import qn


def extract_runs(para_element: etree._Element) -> List[TextRun]:
    """
    Parse all w:r elements inside *para_element* and return merged TextRuns.

    Handles:
    - w:t (plain text)
    - w:rPr/w:b, w:i, w:u for bold/italic/underline
    - w:tab → single space
    - w:br  → ignored (line break within paragraph)
    - Nested in w:hyperlink, w:ins, w:del are included
    """
    raw: List[TextRun] = []

    for run_el in _iter_runs(para_element):
        text = _run_text(run_el)
        if not text:
            continue
        bold, italic, underline = _run_formatting(run_el)
        raw.append(TextRun(text=text, bold=bold, italic=italic, underline=underline))

    return _merge_runs(raw)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _iter_runs(para_element: etree._Element):
    """Yield all w:r elements, including those inside hyperlinks, revisions, and field codes."""
    W_R    = qn("w", "r")
    W_HYPL = qn("w", "hyperlink")
    W_INS  = qn("w", "ins")
    W_DEL  = qn("w", "del")
    W_FLD  = qn("w", "fldSimple")

    for child in para_element:
        tag = child.tag
        if tag == W_R:
            yield child
        elif tag in (W_HYPL, W_INS, W_DEL, W_FLD):
            # Descend one level
            for sub in child:
                if sub.tag == W_R:
                    yield sub


def _run_text(run_el: etree._Element) -> str:
    """Extract raw text from a w:r element."""
    W_T   = qn("w", "t")
    W_TAB = qn("w", "tab")
    W_BR  = qn("w", "br")

    parts: List[str] = []
    for child in run_el:
        if child.tag == W_T:
            parts.append(child.text or "")
        elif child.tag == W_TAB:
            parts.append(" ")
        # w:br is ignored — paragraph-level line breaks are not significant
    return "".join(parts)


def _run_formatting(run_el: etree._Element):
    """Return (bold, italic, underline) booleans for a w:r element."""
    W_RPR = qn("w", "rPr")
    W_B   = qn("w", "b")
    W_I   = qn("w", "i")
    W_U   = qn("w", "u")
    W_VAL = qn("w", "val")

    rpr = run_el.find(W_RPR)
    if rpr is None:
        return False, False, False

    def _is_on(tag):
        el = rpr.find(tag)
        if el is None:
            return False
        val = el.get(W_VAL, "")
        # w:val="false" or "0" explicitly turns it off
        return val.lower() not in ("false", "0", "none")

    bold      = _is_on(W_B)
    italic    = _is_on(W_I)
    underline = _is_on(W_U)
    return bold, italic, underline


def _merge_runs(runs: List[TextRun]) -> List[TextRun]:
    """Merge consecutive runs that have identical formatting."""
    if not runs:
        return []
    merged: List[TextRun] = [TextRun(
        text=runs[0].text,
        bold=runs[0].bold,
        italic=runs[0].italic,
        underline=runs[0].underline,
    )]
    for r in runs[1:]:
        last = merged[-1]
        if last.bold == r.bold and last.italic == r.italic and last.underline == r.underline:
            last.text += r.text
        else:
            merged.append(TextRun(text=r.text, bold=r.bold, italic=r.italic, underline=r.underline))
    return merged


def plain_text(runs: List[TextRun]) -> str:
    """Return the concatenated plain text from a list of TextRuns."""
    return "".join(r.text for r in runs)
