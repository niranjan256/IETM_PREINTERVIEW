"""Stage 5 — XML Emission.

Recursively walks the DocumentNode tree and produces the IETM XML file.
Uses lxml for building and pretty-printing.

Output structure (document order preserved):
  <ietm>
    <identInfo/>
    <section>          ← H1
      <para/>
      <figure/>        ← in document order
      <table/>
      <list/>
      <section/>       ← H2 child
      <leaf-group root="sec-X.Y.Z">
        <section/>     ← root section of the group
        <leaf/>        ← remaining leaves
      </leaf-group>
    </section>
  </ietm>
"""

from __future__ import annotations

import datetime
from pathlib import Path
from typing import List, Union

from lxml import etree

from .models import (
    Block, DocumentNode, FigureNode, HotspotNode, LeafGroup,
    LeafNode, ListItemNode, ListNode, ListType, MeshHotspotNode,
    Model3DNode, ParagraphNode, PdfNode, Run, SectionNode,
    TableCell, TableNode, TableRow, TextRun, VideoNode, XRefRun,
)
from .table_parser import parse_table
from .tree_builder import _RawTableBlock
from .xref_resolver import _process_runs as xref_process_runs


def emit(
    doc: DocumentNode,
    output_dir: Path,
    config,
    ctx,
) -> None:
    """Build the XML tree and write it to output_dir/ietm_output.xml."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    today = datetime.date.today().isoformat()

    root = etree.Element("ietm")
    root.set("docId",          doc.doc_id)
    root.set("classification", config.classification)
    root.set("generatedDate",  today)
    root.set("generatorVersion", "1.0")

    # <identInfo>
    ident = etree.SubElement(root, "identInfo")
    _sub_text(ident, "title",   doc.title)
    _sub_text(ident, "docType", "Technical Manual")

    # Top-level sections
    for sec in doc.sections:
        _emit_section(root, sec, ctx, config)

    # Write
    out_path = output_dir / "ietm_output.xml"
    tree = etree.ElementTree(root)
    with open(out_path, "wb") as f:
        tree.write(f, pretty_print=True, xml_declaration=True, encoding="UTF-8")

    ctx.stats["xml_written"] = str(out_path)


# ── Section / Leaf ────────────────────────────────────────────────────────────

def _emit_section(parent_el, sec: SectionNode, ctx, config=None) -> etree._Element:
    el = etree.SubElement(parent_el, "section")
    el.set("id",     sec.id)
    el.set("number", sec.number)
    el.set("level",  str(sec.level))
    el.set("title",  sec.title)
    if sec.access_groups and sec.access_groups != "all":
        el.set("accessGroups", sec.access_groups)
    if sec.security_class:
        el.set("securityClass", sec.security_class)

    _emit_blocks(el, sec.blocks, ctx, config)

    for child in sec.children:
        if isinstance(child, SectionNode):
            _emit_section(el, child, ctx, config)
        elif isinstance(child, LeafGroup):
            _emit_leaf_group(el, child, ctx, config)

    return el


def _emit_leaf_group(parent_el, group: LeafGroup, ctx, config=None) -> None:
    lg = etree.SubElement(parent_el, "leaf-group")
    lg.set("root", group.root_section.id)
    lg.set("title", group.root_section.title)

    # Emit root section as <leaf> (not <section>) to avoid tag ambiguity
    root_as_leaf = LeafNode(
        id=group.root_section.id,
        number=group.root_section.number,
        title=group.root_section.title,
        blocks=group.root_section.blocks,
    )
    _emit_leaf(lg, root_as_leaf, ctx, config)

    # Remaining children: emitted as <leaf>
    for leaf in group.leaves:
        _emit_leaf(lg, leaf, ctx, config)


def _emit_leaf(parent_el, leaf: LeafNode, ctx, config=None) -> None:
    el = etree.SubElement(parent_el, "leaf")
    el.set("id",     leaf.id)
    el.set("number", leaf.number)
    el.set("title",  leaf.title)
    if leaf.access_groups and leaf.access_groups != "all":
        el.set("accessGroups", leaf.access_groups)
    if leaf.security_class:
        el.set("securityClass", leaf.security_class)
    _emit_blocks(el, leaf.blocks, ctx, config)


# ── Block dispatch ────────────────────────────────────────────────────────────

def _emit_blocks(parent_el, blocks: list, ctx, config=None) -> None:
    for b in blocks:
        if isinstance(b, ParagraphNode):
            _emit_para(parent_el, b)
        elif isinstance(b, ListNode):
            _emit_list(parent_el, b)
        elif isinstance(b, FigureNode):
            _emit_figure(parent_el, b)
        elif isinstance(b, (TableNode, _RawTableBlock)):
            _emit_table_block(parent_el, b, ctx, config)
        elif isinstance(b, Model3DNode):
            _emit_model3d(parent_el, b)
        elif isinstance(b, VideoNode):
            _emit_video(parent_el, b)
        elif isinstance(b, PdfNode):
            _emit_pdf(parent_el, b)
        # Unknown sentinel types are silently skipped


def _emit_para(parent_el, para: ParagraphNode) -> None:
    el = etree.SubElement(parent_el, "para")
    if para.para_type:
        el.set("type", para.para_type)
    for run in para.runs:
        _emit_run(el, run)


def _emit_list(parent_el, lst: ListNode) -> None:
    el = etree.SubElement(parent_el, "list")
    el.set("type", lst.list_type.value)
    for item in lst.items:
        _emit_list_item(el, item)


def _emit_list_item(parent_el, item: ListItemNode) -> None:
    el = etree.SubElement(parent_el, "item")
    if item.label:
        el.set("label", item.label)
    for run in item.runs:
        _emit_run(el, run)
    if item.sub_items:
        # Wrap sub_items in a nested <list> element
        sub_type = item.sub_list_type.value if item.sub_list_type else "roman"
        sub_list_el = etree.SubElement(el, "list")
        sub_list_el.set("type", sub_type)
        for sub in item.sub_items:
            _emit_list_item(sub_list_el, sub)


def _emit_figure(parent_el, fig: FigureNode) -> None:
    el = etree.SubElement(parent_el, "figure")
    el.set("id",     fig.id)
    el.set("number", fig.number)
    _sub_text(el, "title", fig.title)

    graphic = etree.SubElement(el, "graphic")
    graphic.set("src", fig.image_filename)

    if fig.hotspots:
        hs_el = etree.SubElement(el, "hotspots")
        for hs in fig.hotspots:
            h = etree.SubElement(hs_el, "hotspot")
            h.set("x",      str(hs.x))
            h.set("y",      str(hs.y))
            h.set("w",      str(hs.w))
            h.set("h",      str(hs.h))
            h.set("label",  hs.label or hs.text)
            h.set("desc",   hs.desc)
            h.set("target", hs.target)


def _emit_model3d(parent_el, model: Model3DNode) -> None:
    el = etree.SubElement(parent_el, "model3d")
    el.set("id",     model.id)
    el.set("file",   model.file)
    el.set("format", model.format)
    _sub_text(el, "title", model.title)
    for mh in model.mesh_hotspots:
        mh_el = etree.SubElement(el, "meshHotspot")
        mh_el.set("meshName", mh.mesh_name)
        mh_el.set("target",   mh.target)
        mh_el.set("text",     mh.text)


def _emit_video(parent_el, video: VideoNode) -> None:
    el = etree.SubElement(parent_el, "video")
    el.set("id",    video.id)
    el.set("file",  video.file)
    el.set("title", video.title)


def _emit_pdf(parent_el, pdf: PdfNode) -> None:
    el = etree.SubElement(parent_el, "pdf")
    el.set("id",    pdf.id)
    el.set("file",  pdf.file)
    el.set("title", pdf.title)


def _emit_table_block(parent_el, block, ctx, config=None) -> None:
    """Parse _RawTableBlock or emit already-parsed TableNode."""
    if isinstance(block, _RawTableBlock):
        try:
            tbl_node = parse_table(
                element=block.element,
                table_id=block.id,
                table_number=block.number,
                table_title=block.title,
                config=config,
                image_map=getattr(ctx, 'image_map', None),
            )
        except Exception as exc:
            ctx.warn("xml_emitter", -1,
                     f"Failed to parse table {block.id}: {exc}", "ERROR")
            return
    else:
        tbl_node = block

    # Apply cross-reference resolution to table cell runs
    registry = getattr(ctx, 'xref_registry', None)
    xref_re = getattr(ctx, 'xref_re', None)
    if registry and xref_re:
        for row in tbl_node.header_rows + tbl_node.body_rows:
            for cell in row.cells:
                if not cell.is_continuation and cell.runs:
                    cell.runs = xref_process_runs(cell.runs, xref_re, registry, ctx)

    _emit_table(parent_el, tbl_node)


def _emit_table(parent_el, tbl: TableNode) -> None:
    el = etree.SubElement(parent_el, "table")
    el.set("id",     tbl.id)
    el.set("number", tbl.number)
    _sub_text(el, "title", tbl.title)

    tgroup = etree.SubElement(el, "tgroup")
    tgroup.set("cols", str(tbl.col_count))

    if tbl.header_rows:
        thead = etree.SubElement(tgroup, "thead")
        for row in tbl.header_rows:
            _emit_table_row(thead, row, tbl.col_count)

    tbody = etree.SubElement(tgroup, "tbody")
    for row in tbl.body_rows:
        _emit_table_row(tbody, row, tbl.col_count)


def _emit_table_row(parent_el, row: TableRow, col_count: int) -> None:
    row_el = etree.SubElement(parent_el, "row")
    col_pos = 1
    for cell in row.cells:
        if cell.is_continuation:
            col_pos += cell.col_span
            continue
        entry = etree.SubElement(row_el, "entry")
        if cell.col_span > 1:
            entry.set("namest",  f"col{col_pos}")
            entry.set("nameend", f"col{col_pos + cell.col_span - 1}")
        if cell.row_span > 1:
            entry.set("morerows", str(cell.row_span - 1))
        if cell.content_list:
            _emit_list(entry, cell.content_list)
        else:
            for run in cell.runs:
                _emit_run(entry, run)
        # Emit images found in cell paragraphs
        for img_path in cell.image_paths:
            graphic = etree.SubElement(entry, "graphic")
            graphic.set("src", img_path)
        col_pos += cell.col_span


# ── Inline content ────────────────────────────────────────────────────────────

def _emit_run(parent_el, run: Run) -> None:
    if isinstance(run, XRefRun):
        xref = etree.SubElement(parent_el, "xref")
        xref.set("target",  run.target_id)
        xref.set("refType", run.ref_type)
        xref.text = run.display_text
        return

    # TextRun
    assert isinstance(run, TextRun)
    text = run.text
    if not text:
        return

    if run.bold or run.italic or run.underline:
        em = etree.SubElement(parent_el, "emphasis")
        types = []
        if run.bold:      types.append("bold")
        if run.italic:    types.append("italic")
        if run.underline: types.append("underline")
        em.set("type", " ".join(types))
        em.text = text
    else:
        # Append as tail of last child, or as text of parent
        children = list(parent_el)
        if children:
            last = children[-1]
            last.tail = (last.tail or "") + text
        else:
            parent_el.text = (parent_el.text or "") + text


# ── Utility ───────────────────────────────────────────────────────────────────

def _sub_text(parent, tag: str, text: str) -> etree._Element:
    el = etree.SubElement(parent, tag)
    el.text = text
    return el
