"""Stage 3 — Tree Building.

Builds the SectionNode hierarchy from the classified flat list, then
applies leaf-group post-processing.
"""

from __future__ import annotations

import re
from typing import List, Union

from .content_classifier import ClassifiedElement, ElemType
from .docx_reader import DocMetadata
from .models import (
    Block, DocumentNode, FigureNode, LeafGroup, LeafNode,
    ListItemNode, ListNode, ListType, ParagraphNode, SectionNode, TableNode,
    TextRun,
)
from .utils import make_figure_id, make_section_id, make_table_id


# ── Public API ────────────────────────────────────────────────────────────────

def build(
    classified: List[ClassifiedElement],
    metadata: DocMetadata,
    config,
    ctx,
) -> DocumentNode:
    """
    Convert the flat classified list into a DocumentNode tree.

    Steps:
      1. Stack-based section hierarchy
      2. Leaf-group post-processing (depth-first)
      3. Section number assignment (tree position, not Word numbering)
    """
    doc_title = (config.title or metadata.title or "Technical Manual")
    doc_id    = (config.doc_id or "")

    doc = DocumentNode(title=doc_title, doc_id=doc_id)

    # ── 1. Stack-based build ──────────────────────────────────────────────────
    # Stack entries: (SectionNode_or_DocumentNode, level)
    # DocumentNode acts as the virtual root at level 0

    stack: List[tuple] = [(doc, 0)]

    auto_tbl = [0]   # mutable counter for untitled tables

    for ce in classified:
        current_parent, current_level = stack[-1]

        if ce.elem_type == ElemType.HEADING:
            level = ce.heading_level
            # Pop until top is a strict ancestor
            while len(stack) > 1 and stack[-1][1] >= level:
                stack.pop()
            parent, _ = stack[-1]

            sec = SectionNode(
                id="",        # filled during numbering pass
                number="",
                level=level,
                title=ce.heading_title,
            )
            _append_section(parent, sec)
            stack.append((sec, level))

        else:
            # Content block — append to the current stack top
            target_node, _ = stack[-1]
            block = _make_block(ce, auto_tbl, doc_id)
            if block is not None:
                _append_block(target_node, block)

    # ── 2. Leaf-group post-processing ─────────────────────────────────────────
    _apply_leaf_grouping(doc)

    # ── 3. Number assignment ──────────────────────────────────────────────────
    _assign_numbers(doc)

    return doc


# ── Tree mutation helpers ─────────────────────────────────────────────────────

def _append_section(parent, sec: SectionNode) -> None:
    """Add a SectionNode to parent (DocumentNode or SectionNode)."""
    if isinstance(parent, DocumentNode):
        parent.sections.append(sec)
    else:
        parent.children.append(sec)


def _append_block(node, block: Block) -> None:
    """Add a content block to a section or the document root (goes to first section)."""
    if isinstance(node, SectionNode):
        node.blocks.append(block)
    # Blocks at DocumentNode level are pre-heading — silently drop or attach to
    # a "preamble" section if desired.  For now, drop.


class _PendingListItem:
    """Sentinel: a list item not yet grouped into a ListNode."""
    def __init__(self, item: ListItemNode, list_type: str):
        self.item = item
        self.list_type = list_type  # "alpha", "roman", "numbered", "bullet"


class _RawTableBlock:
    """Sentinel: holds the lxml element until table_parser processes it."""
    def __init__(self, id: str, number: str, title: str, element):
        self.id = id
        self.number = number
        self.title = title
        self.element = element


def _make_block(ce: ClassifiedElement, auto_tbl: List[int], doc_id: str = "") -> Block:
    """Convert a ClassifiedElement into a Block node."""
    if ce.elem_type == ElemType.FIGURE:
        return FigureNode(
            id=make_figure_id(ce.figure_number, doc_id),
            number=ce.figure_number,
            title=ce.figure_title,
            image_filename=ce.image_filename,
        )

    if ce.elem_type == ElemType.TABLE:
        if ce.table_number:
            tid = make_table_id(ce.table_number, doc_id)
            tnum = ce.table_number
            ttitle = ce.table_title
        else:
            auto_tbl[0] += 1
            tnum  = f"auto_{auto_tbl[0]}"
            base_tid = f"tbl_auto_{auto_tbl[0]}"
            tid   = f"{doc_id}_{base_tid}" if doc_id else base_tid
            ttitle = "[Untitled Table]"
        # TableNode body will be populated by table_parser during XML emission.
        # Store the raw lxml element in a special wrapper.
        return _RawTableBlock(
            id=tid, number=tnum, title=ttitle,
            element=ce.raw.element,
        )

    if ce.elem_type == ElemType.LIST_ITEM:
        raw_text = _runs_from_ce(ce)
        if ce.list_label and raw_text:
            raw_text = _strip_list_prefix(raw_text, ce.list_label)
        item = ListItemNode(
            label=ce.list_label,
            runs=raw_text,
        )
        return _PendingListItem(item=item, list_type=ce.list_type)

    if ce.elem_type == ElemType.PARAGRAPH:
        runs = _runs_from_ce(ce)
        return ParagraphNode(runs=runs)

    return None


def _runs_from_ce(ce: ClassifiedElement):
    """Extract runs from a classified element's raw paragraph."""
    from .docx_reader import RawParagraph
    if isinstance(ce.raw, RawParagraph):
        return ce.raw.runs
    return []


def _strip_list_prefix(runs, label: str):
    """Strip the list label prefix (e.g. '(a) ') from the beginning of runs.

    Handles variations: (a), a), a., a with flexible whitespace.
    """
    plain = "".join(r.text for r in runs)
    escaped_label = re.escape(label)

    # Try patterns in order: most specific to most general
    patterns = [
        r'^(\s*)[(](\s*)' + escaped_label + r'(\s*)[)](\s*)',
        r'^(\s*)' + escaped_label + r'[)](\s*)',
        r'^(\s*)' + escaped_label + r'[.](\s*)',
        r'^(\s*)' + escaped_label + r'(\s+)',
    ]

    prefix_len = 0
    for pat in patterns:
        m = re.match(pat, plain, re.IGNORECASE)
        if m:
            prefix_len = m.end()
            break

    if not prefix_len:
        return runs

    # Strip prefix_len characters from the front of runs
    result = []
    remaining = prefix_len
    for run in runs:
        if remaining <= 0:
            result.append(run)
        elif remaining >= len(run.text):
            remaining -= len(run.text)
        else:
            result.append(TextRun(
                text=run.text[remaining:],
                bold=run.bold, italic=run.italic, underline=run.underline,
            ))
            remaining = 0
    return result
def consolidate_lists(sections: List[SectionNode]) -> None:
    """
    Walk all sections and replace runs of _PendingListItem in each
    section's blocks with ListNode groups.
    Called at the end of build().
    """
    for sec in sections:
        sec.blocks = _consolidate_block_list(sec.blocks)
        consolidate_lists([c for c in sec.children if isinstance(c, SectionNode)])
        for c in sec.children:
            if isinstance(c, LeafGroup):
                c.root_section.blocks = _consolidate_block_list(c.root_section.blocks)
                for leaf in c.leaves:
                    leaf.blocks = _consolidate_block_list(leaf.blocks)


def _alpha_label(idx: int) -> str:
    """0->'a', 25->'z', 26->'aa', 27->'ab', ..."""
    label = ""
    n = idx
    while True:
        label = chr(ord('a') + (n % 26)) + label
        n = n // 26 - 1
        if n < 0:
            break
    return label


def _consolidate_block_list(blocks):
    """
    Replace consecutive _PendingListItem objects with ListNode groups.

    Rules:
    - Roman/numbered items immediately following an alpha item are nested as
      sub_items of the last alpha item (not a separate list).
    - Bullet items are converted to alpha lists with auto-labels a, b, c, ...
    - Standalone roman/numbered lists (no preceding alpha parent) group normally.
    - If ANY non-list block intervenes, the current group closes.
    """
    result = []
    i = 0
    while i < len(blocks):
        b = blocks[i]
        if not isinstance(b, _PendingListItem):
            result.append(b)
            i += 1
            continue

        # Start a new list group
        lt = b.list_type
        items = [b.item]
        j = i + 1

        while j < len(blocks) and isinstance(blocks[j], _PendingListItem):
            next_lt = blocks[j].list_type

            # Nest roman/numbered items under the last alpha/bullet item
            if lt in ("alpha", "bullet") and next_lt in ("roman", "numbered"):
                sub_type = next_lt
                sub_items = [blocks[j].item]
                k = j + 1
                while (k < len(blocks)
                       and isinstance(blocks[k], _PendingListItem)
                       and blocks[k].list_type == next_lt):
                    sub_items.append(blocks[k].item)
                    k += 1
                # Attach to the last alpha item collected so far
                items[-1].sub_items = sub_items
                items[-1].sub_list_type = ListType(sub_type)
                j = k

            elif next_lt == lt:
                items.append(blocks[j].item)
                j += 1

            else:
                break

        # Single text-pattern detected item with no siblings = false positive list.
        # Emit as a plain paragraph (the label was part of the original text).
        if len(items) == 1 and lt != "bullet":
            item = items[0]
            label_run = TextRun(text=f"({item.label}) ", bold=False, italic=False, underline=False)
            result.append(ParagraphNode(runs=[label_run] + list(item.runs)))
            i = j
            continue

        # Convert bullet list to alpha with auto-labels
        if lt == "bullet":
            for idx, item in enumerate(items):
                item.label = _alpha_label(idx)
            result.append(ListNode(list_type=ListType.ALPHA, items=items))
        else:
            result.append(ListNode(list_type=ListType(lt), items=items))

        i = j

    return result


# ── Leaf-group detection ──────────────────────────────────────────────────────

def _apply_leaf_grouping(node) -> None:
    """
    Recursively apply leaf-group detection depth-first.
    Works on DocumentNode (has .sections) or SectionNode (has .children).
    """
    if isinstance(node, DocumentNode):
        child_list = node.sections
    else:
        child_list = node.children

    # Recurse first (depth-first)
    for child in list(child_list):
        if isinstance(child, SectionNode):
            _apply_leaf_grouping(child)

    # Now find consecutive leaf runs in child_list
    # Collect only SectionNode entries (LeafGroups already processed above)
    i = 0
    while i < len(child_list):
        # Find start of a consecutive leaf run
        if isinstance(child_list[i], SectionNode) and child_list[i].is_leaf():
            run_start = i
            j = i + 1
            while j < len(child_list) and isinstance(child_list[j], SectionNode) and child_list[j].is_leaf():
                j += 1
            run_end = j   # exclusive

            run_length = run_end - run_start
            if run_length >= 2:
                # Replace the run with a single LeafGroup
                root_sec = child_list[run_start]
                rest = child_list[run_start + 1 : run_end]
                leaves = [
                    LeafNode(
                        id=s.id,
                        number=s.number,
                        title=s.title,
                        blocks=s.blocks,
                    )
                    for s in rest
                ]
                group = LeafGroup(root_section=root_sec, leaves=leaves)
                child_list[run_start : run_end] = [group]
                i = run_start + 1   # continue after the group
            else:
                i += 1
        else:
            i += 1


# ── Section number assignment ─────────────────────────────────────────────────

def _assign_numbers(doc: DocumentNode) -> None:
    """Assign dotted section numbers and IDs to all sections."""
    doc_id = doc.doc_id or ""
    for idx, sec in enumerate(doc.sections):
        _number_section(sec, parent_number="", sibling_index=idx, doc_id=doc_id)


def _number_section(sec: SectionNode, parent_number: str, sibling_index: int, doc_id: str = "") -> None:
    from .utils import compute_child_number, make_section_id
    number = compute_child_number(parent_number, sibling_index)
    sec.number = number
    sec.id     = make_section_id(number, doc_id)

    # Number children
    child_sec_idx = 0
    for child in sec.children:
        if isinstance(child, SectionNode):
            _number_section(child, number, child_sec_idx, doc_id)
            child_sec_idx += 1
        elif isinstance(child, LeafGroup):
            # Number root_section
            _number_section(child.root_section, number, child_sec_idx, doc_id)
            child_sec_idx += 1
            # Number leaves
            for leaf in child.leaves:
                leaf_number = compute_child_number(number, child_sec_idx)
                leaf.number = leaf_number
                leaf.id     = make_section_id(leaf_number, doc_id)
                child_sec_idx += 1
