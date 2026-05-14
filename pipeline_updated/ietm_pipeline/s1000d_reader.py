"""S1000D Data Module (DM) reader — produces a DocumentNode directly.

Replaces Stages 1–3 for S1000D source files.  The output DocumentNode feeds
into the standard Stage 4 (xref_resolver) and Stage 5 (xml_emitter) unchanged.

Supported S1000D content types:
  - <description>   containing <levelledPara> hierarchies
  - <procedure>     containing <proceduralStep> hierarchies
  - <figure>        → FigureNode
  - <table>         → TableNode (CALS format, same as DOCX tables)
  - <para>          → ParagraphNode
  - <warning>       → ParagraphNode(para_type="warning")
  - <caution>       → ParagraphNode(para_type="caution")
  - <note>          → ParagraphNode(para_type="note")

S1000D security classification codes → our classification strings:
  "01" → UNCLASSIFIED
  "02" → RESTRICTED
  "03" → CONFIDENTIAL
  "04" → SECRET
  "05" → TOP SECRET

Namespace handling: works with any S1000D issue by matching local element
names only (namespace-agnostic XPath via lxml's Clark notation helper).
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

from lxml import etree

from .models import (
    Block, DocumentNode, FigureNode, HotspotNode, LeafGroup, LeafNode,
    ListItemNode, ListNode, ListType, ParagraphNode, SectionNode,
    TableCell, TableNode, TableRow, TextRun,
)
from .utils import make_figure_id, make_section_id, make_table_id, normalize_whitespace


# ── Security classification mapping ──────────────────────────────────────────

_SECURITY_MAP: Dict[str, str] = {
    "01": "UNCLASSIFIED",
    "02": "RESTRICTED",
    "03": "CONFIDENTIAL",
    "04": "SECRET",
    "05": "TOP SECRET",
}


# ── Public API ────────────────────────────────────────────────────────────────

def read(
    dm_path: str,
    ietm_root: Path,
    config,
    ctx,
) -> DocumentNode:
    """
    Parse an S1000D Data Module XML file and return a DocumentNode.

    *config.doc_id* and *config.title* are updated in place if the DM provides
    values and the config fields are not already set.
    *config.classification* is set from the DM <security> element unless the
    caller has already provided a non-default value.
    """
    path = Path(dm_path)
    try:
        tree = etree.parse(str(path))
    except etree.XMLSyntaxError as exc:
        ctx.warn("s1000d_reader", -1, f"Failed to parse XML: {exc}", "ERROR")
        return DocumentNode(title="Unknown", doc_id="unknown")

    root = tree.getroot()

    # ── Extract metadata ──────────────────────────────────────────────────────
    doc_id, title, classification, access_groups = _extract_metadata(root, ctx)

    if config.doc_id:
        doc_id = config.doc_id
    else:
        config.doc_id = doc_id

    if config.title:
        title = config.title
    else:
        config.title = title

    if classification and config.classification == "UNCLASSIFIED":
        config.classification = classification

    if not config.access_groups or config.access_groups == "all":
        if access_groups:
            config.access_groups = access_groups

    # ── Set up images directory ───────────────────────────────────────────────
    output_dir = Path(ietm_root) / config.doc_id
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    # Build ICN → image file map from sibling files
    icn_map = _build_icn_map(path.parent)

    doc = DocumentNode(title=title, doc_id=doc_id)

    # ── Walk content ──────────────────────────────────────────────────────────
    content_el = _find_local(root, "content")
    if content_el is None:
        ctx.warn("s1000d_reader", -1, "No <content> element found in DM", "WARNING")
        return doc

    reader = _ContentReader(doc_id=doc_id, images_dir=images_dir,
                            icn_map=icn_map, ctx=ctx)

    # Try description (descriptive DM)
    desc_el = _find_local(content_el, "description")
    if desc_el is not None:
        sections = reader.read_description(desc_el)
        doc.sections.extend(sections)

    # Try procedure (procedural DM)
    proc_el = _find_local(content_el, "procedure")
    if proc_el is not None:
        sections = reader.read_procedure(proc_el)
        doc.sections.extend(sections)

    # Fallback: treat direct children as paragraphs
    if not doc.sections:
        para_sec = SectionNode(
            id=make_section_id("1", doc_id),
            number="1",
            level=1,
            title=title,
        )
        for el in content_el:
            blocks = reader.read_block(el)
            para_sec.blocks.extend(blocks)
        if para_sec.blocks:
            doc.sections.append(para_sec)

    ctx.stats["s1000d_dms"] = ctx.stats.get("s1000d_dms", 0) + 1
    return doc


# ── Metadata extraction ───────────────────────────────────────────────────────

def _extract_metadata(
    root: etree._Element, ctx
) -> Tuple[str, str, str, str]:
    """Return (doc_id, title, classification, access_groups)."""
    doc_id = ""
    title = "Untitled"
    classification = ""
    access_groups = ""

    # ── doc_id from DMC ───────────────────────────────────────────────────────
    dmc_el = _find_local(root, "dmCode")
    if dmc_el is not None:
        parts = [
            dmc_el.get("modelIdentCode", ""),
            dmc_el.get("systemCode", ""),
            dmc_el.get("subSystemCode", "") + dmc_el.get("subSubSystemCode", ""),
            dmc_el.get("assyCode", ""),
            dmc_el.get("disassyCode", "") + dmc_el.get("disassyCodeVariant", ""),
            dmc_el.get("infoCode", "") + dmc_el.get("infoCodeVariant", ""),
            dmc_el.get("itemLocationCode", ""),
        ]
        doc_id = "-".join(p for p in parts if p) or "DM-UNKNOWN"
    else:
        # Try simpler id attributes on root
        doc_id = root.get("id") or root.get("docId") or "DM-UNKNOWN"

    # ── title from dmTitle ────────────────────────────────────────────────────
    title_el = _find_local(root, "dmTitle")
    if title_el is not None:
        tech = _text_of(_find_local(title_el, "techName"))
        info = _text_of(_find_local(title_el, "infoName"))
        parts = [p for p in [tech, info] if p]
        title = " — ".join(parts) if parts else title
    else:
        # Fallback: any <title> near the top
        t_el = _find_local(root, "title")
        if t_el is not None:
            title = _text_of(t_el) or title

    # ── classification from <security> ────────────────────────────────────────
    sec_el = _find_local(root, "security")
    if sec_el is not None:
        code = sec_el.get("securityClassification", "01")
        classification = _SECURITY_MAP.get(code, "UNCLASSIFIED")

    # ── access_groups from <applic> ───────────────────────────────────────────
    applic_el = _find_local(root, "applic")
    if applic_el is not None:
        values: List[str] = []
        for assert_el in applic_el.iter():
            if _local(assert_el) == "assert":
                v = assert_el.get("applicPropertyValues", "")
                if v:
                    values.extend(v.split("|"))
        if values:
            access_groups = ",".join(normalize_whitespace(v) for v in values if v.strip())

    return doc_id, title, classification, access_groups


# ── ICN image map ─────────────────────────────────────────────────────────────

def _build_icn_map(source_dir: Path) -> Dict[str, Path]:
    """
    Build a map from ICN identifier → image file path.
    Searches *source_dir* for image files whose stem matches the ICN.
    e.g. "ICN-CALM-A0001-00001-A-01-1" → Path(".../ICN-CALM-A0001-00001-A-01-1.png")
    """
    image_exts = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
    icn_map: Dict[str, Path] = {}
    if not source_dir.is_dir():
        return icn_map
    for f in source_dir.iterdir():
        if f.suffix.lower() in image_exts:
            icn_map[f.stem] = f
    return icn_map


# ── Content reader ────────────────────────────────────────────────────────────

class _ContentReader:
    def __init__(self, doc_id: str, images_dir: Path,
                 icn_map: Dict[str, Path], ctx):
        self.doc_id     = doc_id
        self.images_dir = images_dir
        self.icn_map    = icn_map
        self.ctx        = ctx
        self._section_counter: List[int] = []
        self._fig_counter: int = 0
        self._tbl_counter: int = 0

    # ── Description content ───────────────────────────────────────────────────

    def read_description(self, desc_el: etree._Element) -> List[SectionNode]:
        """Read a <description> element → list of top-level SectionNodes."""
        sections: List[SectionNode] = []
        sec_idx = 0
        for child in desc_el:
            lname = _local(child)
            if lname == "levelledPara":
                sec_idx += 1
                sec = self._read_levelled_para(child, level=1, parent_num="")
                sections.append(sec)
            else:
                # Content outside levelledPara: prepend to first section or create one
                blocks = self.read_block(child)
                if blocks:
                    if not sections:
                        sec_idx += 1
                        sections.append(SectionNode(
                            id=make_section_id(str(sec_idx), self.doc_id),
                            number=str(sec_idx),
                            level=1,
                            title="General",
                        ))
                    sections[-1].blocks.extend(blocks)
        return sections

    def _read_levelled_para(
        self, el: etree._Element, level: int, parent_num: str
    ) -> SectionNode:
        # Use the element's id attribute if available
        el_id = el.get("id", "")
        # Compute section number by position among siblings
        parent = el.getparent()
        sibling_idx = sum(
            1 for s in (parent or [])
            if _local(s) == "levelledPara" and s.sourceline <= el.sourceline
        ) if parent is not None else 1
        number = f"{parent_num}.{sibling_idx}" if parent_num else str(sibling_idx)

        title_el = _find_local(el, "title")
        title = _text_of(title_el) or f"Section {number}"

        sec_id = el_id if el_id else make_section_id(number, self.doc_id)
        sec = SectionNode(id=sec_id, number=number, level=level, title=title)

        for child in el:
            lname = _local(child)
            if lname == "title":
                continue
            elif lname == "levelledPara":
                child_sec = self._read_levelled_para(child, level + 1, number)
                sec.children.append(child_sec)
            else:
                blocks = self.read_block(child)
                sec.blocks.extend(blocks)

        return sec

    # ── Procedure content ─────────────────────────────────────────────────────

    def read_procedure(self, proc_el: etree._Element) -> List[SectionNode]:
        """Read a <procedure> element → list of top-level SectionNodes."""
        sections: List[SectionNode] = []

        # preliminaryRqmts → its own section
        prelim = _find_local(proc_el, "preliminaryRqmts")
        if prelim is not None:
            sec = SectionNode(
                id=make_section_id("prelim", self.doc_id),
                number="0",
                level=1,
                title="Preliminary Requirements",
            )
            for child in prelim:
                sec.blocks.extend(self.read_block(child))
            if sec.blocks:
                sections.append(sec)

        # mainProcedure → numbered steps
        main_proc = _find_local(proc_el, "mainProcedure")
        if main_proc is not None:
            step_sec = SectionNode(
                id=make_section_id("proc", self.doc_id),
                number="1",
                level=1,
                title="Procedure",
            )
            step_idx = 0
            for child in main_proc:
                if _local(child) == "proceduralStep":
                    step_idx += 1
                    child_sec = self._read_step(child, level=2,
                                                parent_num="1", step_idx=step_idx)
                    step_sec.children.append(child_sec)
                else:
                    step_sec.blocks.extend(self.read_block(child))
            sections.append(step_sec)

        return sections

    def _read_step(
        self, el: etree._Element, level: int, parent_num: str, step_idx: int
    ) -> SectionNode:
        number = f"{parent_num}.{step_idx}" if parent_num else str(step_idx)
        el_id  = el.get("id", make_section_id(f"step_{number}", self.doc_id))
        title  = f"Step {number}"

        sec = SectionNode(id=el_id, number=number, level=level, title=title)

        sub_idx = 0
        for child in el:
            lname = _local(child)
            if lname == "proceduralStep":
                sub_idx += 1
                child_sec = self._read_step(child, level + 1, number, sub_idx)
                sec.children.append(child_sec)
            else:
                sec.blocks.extend(self.read_block(child))

        return sec

    # ── Generic block dispatcher ──────────────────────────────────────────────

    def read_block(self, el: etree._Element) -> List[Block]:
        lname = _local(el)
        if lname == "para":
            return [self._read_para(el, "")]
        elif lname == "warning":
            return [self._read_callout(el, "warning")]
        elif lname == "caution":
            return [self._read_callout(el, "caution")]
        elif lname == "note":
            return [self._read_callout(el, "note")]
        elif lname == "figure":
            node = self._read_figure(el)
            return [node] if node else []
        elif lname == "table":
            node = self._read_table(el)
            return [node] if node else []
        elif lname in ("randomList", "sequentialList"):
            node = self._read_list(el, lname)
            return [node] if node else []
        return []

    # ── Para ──────────────────────────────────────────────────────────────────

    def _read_para(self, el: etree._Element, para_type: str) -> ParagraphNode:
        text = normalize_whitespace("".join(el.itertext()))
        return ParagraphNode(
            runs=[TextRun(text=text)] if text else [],
            para_type=para_type,
        )

    def _read_callout(self, el: etree._Element, callout_type: str) -> ParagraphNode:
        """Read warning/caution/note — extract inner text from child paras."""
        texts: List[str] = []
        for child in el:
            lname = _local(child)
            if lname in ("warningAndCautionPara", "notePara", "para"):
                t = normalize_whitespace("".join(child.itertext()))
                if t:
                    texts.append(t)
        if not texts:
            texts = [normalize_whitespace("".join(el.itertext()))]
        combined = " ".join(texts)
        return ParagraphNode(
            runs=[TextRun(text=combined)] if combined else [],
            para_type=callout_type,
        )

    # ── Figure ────────────────────────────────────────────────────────────────

    def _read_figure(self, el: etree._Element) -> Optional[FigureNode]:
        self._fig_counter += 1
        number = str(self._fig_counter)

        title_el = _find_local(el, "title")
        title = _text_of(title_el) or f"Figure {number}"

        el_id = el.get("id", make_figure_id(number, self.doc_id))

        # Find <graphic> → get ICN
        graphic_el = _find_local(el, "graphic")
        image_filename = "MISSING"
        if graphic_el is not None:
            icn = (graphic_el.get("infoEntityIdent") or
                   graphic_el.get("boardno") or
                   graphic_el.get("src") or "")
            image_filename = self._resolve_icn(icn, number)

        fig = FigureNode(
            id=el_id,
            number=number,
            title=title,
            image_filename=image_filename,
        )
        return fig

    def _resolve_icn(self, icn: str, fig_number: str) -> str:
        """Copy the ICN image file to images_dir and return relative path."""
        if not icn:
            return "MISSING"

        # Direct match in ICN map
        if icn in self.icn_map:
            src = self.icn_map[icn]
            dest = self.images_dir / src.name
            if not dest.exists():
                shutil.copy2(src, dest)
            return f"images/{dest.name}"

        # Partial match (ICN may have extra suffix)
        for key, src in self.icn_map.items():
            if icn in key or key in icn:
                dest = self.images_dir / src.name
                if not dest.exists():
                    shutil.copy2(src, dest)
                return f"images/{dest.name}"

        self.ctx.warn("s1000d_reader", -1,
                      f"Figure {fig_number}: image not found for ICN '{icn}'",
                      "WARNING")
        return "MISSING"

    # ── Table ─────────────────────────────────────────────────────────────────

    def _read_table(self, el: etree._Element) -> Optional[TableNode]:
        """Parse CALS-style S1000D table into a TableNode."""
        self._tbl_counter += 1
        number = str(self._tbl_counter)
        el_id  = el.get("id", make_table_id(number, self.doc_id))

        title_el = _find_local(el, "title")
        title = _text_of(title_el) or f"Table {number}"

        tgroup = _find_local(el, "tgroup")
        if tgroup is None:
            return None

        col_count = int(tgroup.get("cols", "1"))
        header_rows: List[TableRow] = []
        body_rows: List[TableRow]   = []

        thead = _find_local(tgroup, "thead")
        if thead is not None:
            for row_el in thead.iter():
                if _local(row_el) == "row":
                    header_rows.append(_read_cals_row(row_el))

        tbody = _find_local(tgroup, "tbody")
        if tbody is not None:
            for row_el in tbody.iter():
                if _local(row_el) == "row":
                    body_rows.append(_read_cals_row(row_el))

        return TableNode(
            id=el_id, number=number, title=title,
            col_count=col_count,
            header_rows=header_rows,
            body_rows=body_rows,
        )

    # ── List ──────────────────────────────────────────────────────────────────

    def _read_list(self, el: etree._Element, lname: str) -> Optional[ListNode]:
        list_type = ListType.NUMBERED if lname == "sequentialList" else ListType.BULLET
        items: List[ListItemNode] = []
        idx = 0
        for child in el:
            if _local(child) in ("listItem", "seqListItem"):
                idx += 1
                label = str(idx) if list_type == ListType.NUMBERED else ""
                text = normalize_whitespace("".join(child.itertext()))
                items.append(ListItemNode(
                    label=label,
                    runs=[TextRun(text=text)] if text else [],
                ))
        return ListNode(list_type=list_type, items=items) if items else None


# ── CALS row reader ───────────────────────────────────────────────────────────

def _read_cals_row(row_el: etree._Element) -> TableRow:
    cells: List[TableCell] = []
    for entry in row_el:
        if _local(entry) != "entry":
            continue
        text = normalize_whitespace("".join(entry.itertext()))
        col_span = 1
        namest  = entry.get("namest", "")
        nameend = entry.get("nameend", "")
        if namest and nameend:
            try:
                col_span = int(nameend.replace("col", "")) - int(namest.replace("col", "")) + 1
            except ValueError:
                col_span = 1
        row_span = int(entry.get("morerows", "0")) + 1
        cells.append(TableCell(
            runs=[TextRun(text=text)] if text else [],
            col_span=col_span,
            row_span=row_span,
        ))
    return TableRow(cells=cells)


# ── lxml helpers ──────────────────────────────────────────────────────────────

def _local(el: etree._Element) -> str:
    """Return local name of an element, stripping Clark-notation namespace."""
    tag = el.tag
    if isinstance(tag, str) and tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag


def _find_local(el: etree._Element, local_name: str) -> Optional[etree._Element]:
    """Find first direct child with matching local name (namespace-agnostic)."""
    for child in el:
        if _local(child) == local_name:
            return child
    return None


def _text_of(el: Optional[etree._Element]) -> str:
    if el is None:
        return ""
    return normalize_whitespace("".join(el.itertext()))
