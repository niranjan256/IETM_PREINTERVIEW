"""Stage 4 — Cross-Reference Resolution.

Scans every paragraph run in the document tree.  Text matching
'Figure X.Y' or 'Table X.Y' is split at the match boundary and replaced
with XRefRun nodes pointing to the correct figure/table ID.
"""

from __future__ import annotations

import re
from typing import Dict, List, Union

from .config import PipelineConfig
from .models import (
    Block, DocumentNode, FigureNode, LeafGroup, LeafNode,
    ListItemNode, ListNode, ParagraphNode, Run, SectionNode,
    TableNode, TextRun, XRefRun,
)
from .tree_builder import _RawTableBlock
from .utils import make_figure_id, make_table_id


# ── Public API ────────────────────────────────────────────────────────────────

def resolve(doc: DocumentNode, config: PipelineConfig, ctx) -> None:
    """
    Build a cross-reference registry from the tree, then walk every run and
    replace figure/table text references with XRefRun nodes.

    Mutates the tree in place.
    """
    xref_re = re.compile(config.xref_pattern)

    # 1. Build registry: "Figure 1.1" → "fig-1.1", "Table 2.3" → "tbl-2.3"
    registry: Dict[str, tuple] = {}   # display_key → (target_id, ref_type)
    _collect_ids(doc, registry)

    # 2. Walk every TextRun in every paragraph
    _walk_doc(doc, xref_re, registry, ctx)

    # 3. Store registry on ctx so the emitter can resolve table cell xrefs
    ctx.xref_registry = registry
    ctx.xref_re = xref_re


# ── Registry collection ───────────────────────────────────────────────────────

def _collect_ids(doc: DocumentNode, registry: Dict) -> None:
    for sec in doc.sections:
        _collect_section(sec, registry)


def _collect_section(sec: SectionNode, registry: Dict) -> None:
    _collect_blocks(sec.blocks, registry)
    for child in sec.children:
        if isinstance(child, SectionNode):
            _collect_section(child, registry)
        elif isinstance(child, LeafGroup):
            _collect_section(child.root_section, registry)
            for leaf in child.leaves:
                _collect_blocks(leaf.blocks, registry)


def _collect_blocks(blocks: list, registry: Dict) -> None:
    for b in blocks:
        if isinstance(b, FigureNode):
            key = f"Figure {b.number}"
            registry[key] = (b.id, "figure")
        elif isinstance(b, TableNode):
            key = f"Table {b.number}"
            registry[key] = (b.id, "table")
        elif isinstance(b, _RawTableBlock):
            key = f"Table {b.number}"
            registry[key] = (b.id, "table")


# ── Walk and replace ──────────────────────────────────────────────────────────

def _walk_doc(doc: DocumentNode, xref_re, registry, ctx) -> None:
    for sec in doc.sections:
        _walk_section(sec, xref_re, registry, ctx)


def _walk_section(sec: SectionNode, xref_re, registry, ctx) -> None:
    sec.blocks = _process_blocks(sec.blocks, xref_re, registry, ctx)
    for child in sec.children:
        if isinstance(child, SectionNode):
            _walk_section(child, xref_re, registry, ctx)
        elif isinstance(child, LeafGroup):
            _walk_section(child.root_section, xref_re, registry, ctx)
            for leaf in child.leaves:
                leaf.blocks = _process_blocks(leaf.blocks, xref_re, registry, ctx)


def _process_blocks(blocks: list, xref_re, registry, ctx) -> list:
    result = []
    for b in blocks:
        if isinstance(b, ParagraphNode):
            b.runs = _process_runs(b.runs, xref_re, registry, ctx)
        elif isinstance(b, ListNode):
            for item in b.items:
                _process_list_item(item, xref_re, registry, ctx)
        result.append(b)
    return result


def _process_list_item(item: ListItemNode, xref_re, registry, ctx) -> None:
    item.runs = _process_runs(item.runs, xref_re, registry, ctx)
    for sub in item.sub_items:
        _process_list_item(sub, xref_re, registry, ctx)


def _process_runs(
    runs: List[Run],
    xref_re,
    registry: Dict,
    ctx,
) -> List[Run]:
    """Split TextRuns at xref match boundaries, replacing matches with XRefRun."""
    result: List[Run] = []
    for run in runs:
        if not isinstance(run, TextRun) or not run.text:
            result.append(run)
            continue
        result.extend(_split_run(run, xref_re, registry, ctx))
    return result


def _split_run(run: TextRun, xref_re, registry: Dict, ctx) -> List[Run]:
    """Split a single TextRun at all xref matches."""
    parts: List[Run] = []
    text = run.text
    last_end = 0

    for m in xref_re.finditer(text):
        # Text before match
        if m.start() > last_end:
            parts.append(TextRun(
                text=text[last_end:m.start()],
                bold=run.bold, italic=run.italic, underline=run.underline,
            ))

        ref_type = m.group(1).lower()  # "figure" or "table"
        number   = m.group(2)
        display  = m.group(0)          # e.g. "Figure 1.1"

        # Look up in registry
        lookup_key = f"{m.group(1).capitalize()} {number}"
        if lookup_key in registry:
            target_id, rtype = registry[lookup_key]
        else:
            target_id = f"UNRESOLVED-{ref_type[0]}fig-{number}" if ref_type == "figure" else f"UNRESOLVED-tbl-{number}"
            rtype = ref_type
            ctx.warn("xref_resolver", -1,
                     f"Unresolved cross-reference: '{display}'", "WARNING")

        parts.append(XRefRun(
            display_text=display,
            target_id=target_id,
            ref_type=rtype,
            bold=run.bold, italic=run.italic, underline=run.underline,
        ))
        last_end = m.end()

    # Text after last match
    if last_end < len(text):
        parts.append(TextRun(
            text=text[last_end:],
            bold=run.bold, italic=run.italic, underline=run.underline,
        ))

    return parts if parts else [run]
