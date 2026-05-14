"""Intermediate Representation (IR) dataclasses for the IETM pipeline.

All pipeline stages share these types.  The tree mirrors the target XML
structure — content blocks are held in document order inside 'blocks'.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Union


# ── Inline formatting ─────────────────────────────────────────────────────────

class ListType(Enum):
    ALPHA    = "alpha"
    ROMAN    = "roman"
    NUMBERED = "numbered"
    BULLET   = "bullet"


@dataclass
class TextRun:
    text: str
    bold: bool = False
    italic: bool = False
    underline: bool = False


@dataclass
class XRefRun:
    """A cross-reference to a figure or table, replacing part of a TextRun."""
    display_text: str   # e.g. "Figure 1.1"
    target_id: str      # e.g. "fig-1.1"
    ref_type: str       # "figure" or "table"
    bold: bool = False
    italic: bool = False
    underline: bool = False


Run = Union[TextRun, XRefRun]


# ── Block content ─────────────────────────────────────────────────────────────

@dataclass
class ParagraphNode:
    runs: List[Run]
    para_type: str = ""   # "", "warning", "caution", "note", "step"


@dataclass
class ListItemNode:
    label: str          # "a", "ii", "1", "" (bullet)
    runs: List[Run]
    sub_items: List["ListItemNode"] = field(default_factory=list)
    sub_list_type: Optional["ListType"] = None  # type of sub_items list (roman, numbered)


@dataclass
class ListNode:
    list_type: ListType
    items: List[ListItemNode]


@dataclass
class HotspotNode:
    x: int
    y: int
    w: int
    h: int
    target: str         # section ID, e.g. "sec-1.1.1"
    text: str           # display label (fallback)
    label: str = ""     # preferred display label
    desc: str = ""      # description of the hotspot area


@dataclass
class FigureNode:
    id: str
    number: str         # e.g. "1.1"
    title: str
    image_filename: str  # relative path under images/ folder
    hotspots: List[HotspotNode] = field(default_factory=list)


@dataclass
class MeshHotspotNode:
    """Clickable region linked to a named mesh in a 3D model."""
    mesh_name: str   # e.g. "piston_1" — matches the mesh name in the GLB/OBJ
    target: str      # section ID, e.g. "sec-2.1.3"
    text: str        # display label


@dataclass
class Model3DNode:
    """A 3D model (GLB / GLTF / OBJ) associated with a topic."""
    id: str
    file: str        # relative path, e.g. "models/engine_assembly.glb"
    format: str      # "glb", "gltf", "obj"
    title: str
    mesh_hotspots: List[MeshHotspotNode] = field(default_factory=list)


@dataclass
class VideoNode:
    """An MP4 / WebM video associated with a topic."""
    id: str
    file: str        # relative path, e.g. "media/procedure_demo.mp4"
    title: str


@dataclass
class PdfNode:
    """A PDF document associated with a topic."""
    id: str
    file: str        # relative path, e.g. "media/wiring_annex.pdf"
    title: str


@dataclass
class TableCell:
    runs: List[Run]
    col_span: int = 1
    row_span: int = 1
    is_continuation: bool = False   # vMerge continuation — skip when emitting
    content_list: Optional["ListNode"] = None  # set when cell contains a list; runs is [] in this case
    image_paths: List[str] = field(default_factory=list)  # relative paths for images in this cell


@dataclass
class TableRow:
    cells: List[TableCell]


@dataclass
class TableNode:
    id: str
    number: str         # e.g. "1.1"
    title: str
    col_count: int
    header_rows: List[TableRow]
    body_rows: List[TableRow]


# Any block-level node that can appear inside a section in document order
Block = Union[ParagraphNode, ListNode, FigureNode, TableNode, Model3DNode, VideoNode, PdfNode]


# ── Section tree ──────────────────────────────────────────────────────────────

@dataclass
class LeafNode:
    """Terminal node within a LeafGroup.  Same structure as SectionNode
    but cannot contain child sections or nested leaf-groups."""
    id: str
    number: str
    title: str
    blocks: List[Block] = field(default_factory=list)
    access_groups: str = "all"   # comma-separated group names; "all" = no restriction
    security_class: str = ""     # e.g. "SECRET"; empty = inherit from document


@dataclass
class LeafGroup:
    """
    Placed at the PARENT section level (not inside the root_section).

    XML emits as:
        <leaf-group root="sec-1.1.1">
          <section id="sec-1.1.1" ...>...</section>   ← root_section
          <leaf id="sec-1.1.2" ...>...</leaf>
          <leaf id="sec-1.1.3" ...>...</leaf>
        </leaf-group>
    """
    root_section: "SectionNode"
    leaves: List[LeafNode]


@dataclass
class SectionNode:
    id: str
    number: str
    level: int          # 1–9
    title: str
    blocks: List[Block] = field(default_factory=list)
    # children holds SectionNode and/or LeafGroup in document order
    children: List[Union["SectionNode", LeafGroup]] = field(default_factory=list)
    access_groups: str = "all"   # comma-separated group names; "all" = no restriction
    security_class: str = ""     # e.g. "CONFIDENTIAL"; empty = inherit from document

    def is_leaf(self) -> bool:
        """True when this section has no child sections or leaf-groups."""
        return len(self.children) == 0


@dataclass
class DocumentNode:
    title: str
    doc_id: str
    sections: List[SectionNode] = field(default_factory=list)
