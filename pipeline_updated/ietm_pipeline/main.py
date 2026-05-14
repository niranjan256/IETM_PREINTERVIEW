"""CLI entry point for the IETM pipeline.

Usage:
  python -m ietm_pipeline.main convert <docx> <ietm_root> [options]
  python -m ietm_pipeline.main convert-s1000d <dm_file> <ietm_root> [options]
  python -m ietm_pipeline.main list    <ietm_root>
  python -m ietm_pipeline.main unregister <ietm_root> <doc_id>

Convert options:
  --doc-id TEXT           Override document ID (default: filename stem)
  --title TEXT            Override document title
  --classification TEXT   Classification marking (default: UNCLASSIFIED)
  --hotspots PATH         Path to hotspots JSON file (optional)
  --models PATH           Path to model_manifest.json for 3D model attachment
  --media PATH            Path to media_manifest.json for video/PDF attachment
  --access-groups TEXT    Comma-separated group names for document-level access
                          (e.g. "ARMAMENT,AVIONICS"). Default: "all"
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

# ── Trial expiry ─────────────────────────────────────────────────────────────
_EXPIRY_DATE = date(2026, 6, 24)

def _check_expiry() -> None:
    if date.today() > _EXPIRY_DATE:
        print("=" * 60)
        print("  TRIAL EXPIRED")
        print(f"  This trial version expired on {_EXPIRY_DATE.isoformat()}.")
        print("  Contact the developer for a licensed version.")
        print("=" * 60)
        sys.exit(1)

from . import (
    content_classifier,
    docx_reader,
    hotspot_merger,
    master_registry,
    s1000d_reader,
    tree_builder,
    xref_resolver,
    xml_emitter,
)
from .config import ACCESS_GROUP_RE, PipelineConfig, SECURITY_MARKER_RE
from .context import PipelineContext
from .tree_builder import consolidate_lists


def cmd_convert(args) -> None:
    docx_path = Path(args.docx)
    ietm_root = Path(args.ietm_root)

    if not docx_path.exists():
        print(f"ERROR: File not found: {docx_path}", file=sys.stderr)
        sys.exit(1)

    config = PipelineConfig(
        doc_id=args.doc_id or docx_path.stem,
        title=args.title or None,
        classification=args.classification,
        access_groups=args.access_groups,
    )

    output_dir = ietm_root / config.doc_id
    ctx = PipelineContext()

    print(f"Converting {docx_path.name} -> {output_dir} ...")

    # Stage 1: Read DOCX
    elements, image_map, metadata = docx_reader.read(
        str(docx_path), output_dir, config, ctx
    )
    ctx.image_map = image_map  # Make available for table_parser during emission
    print(f"  Read {len(elements)} body elements, {len(image_map)} images")

    # Stage 2: Classify
    classified = content_classifier.classify(elements, image_map, config, ctx)
    print(f"  Classified {len(classified)} elements")

    # Stage 3: Build tree
    doc = tree_builder.build(classified, metadata, config, ctx)
    consolidate_lists(doc.sections)
    _rename_images(doc, output_dir)

    # Post-stage 3: parse [MARKER] tokens from heading titles
    _parse_heading_markers(doc, config)

    _count_tree(doc, ctx)
    print(f"  Tree: {ctx.stats['sections']} sections, "
          f"{ctx.stats['figures']} figures, "
          f"{ctx.stats['tables']} tables")

    # Stage 4: Resolve cross-references
    xref_resolver.resolve(doc, config, ctx)

    # Stage 4.5: Merge hotspots / models / media
    if args.hotspots:
        hotspot_merger.merge(doc, args.hotspots, ctx)
        _count_hotspots(doc, ctx)
        print(f"  Hotspots: {ctx.stats['hotspots']}")
    if args.models:
        hotspot_merger.merge_models(doc, args.models, ctx)
        print(f"  3D models merged from {args.models}")
    if args.media:
        hotspot_merger.merge_media(doc, args.media, ctx)
        print(f"  Media (video/PDF) merged from {args.media}")

    # Stage 5: Emit XML
    xml_emitter.emit(doc, output_dir, config, ctx)
    print(f"  XML written to {output_dir}/ietm_output.xml")

    # Register in master.xml
    rel_path = f"{config.doc_id}/ietm_output.xml"
    master_registry.register(ietm_root, config.doc_id, doc.title, rel_path)
    print(f"  Registered in {ietm_root}/master.xml")

    ctx.print_report()


def cmd_convert_s1000d(args) -> None:
    """Convert an S1000D Data Module XML file to IETM XML."""
    dm_path   = Path(args.dm_file)
    ietm_root = Path(args.ietm_root)

    if not dm_path.exists():
        print(f"ERROR: File not found: {dm_path}", file=sys.stderr)
        sys.exit(1)

    config = PipelineConfig(
        doc_id=args.doc_id or None,          # reader will extract from DMC
        title=args.title or None,            # reader will extract from dmTitle
        classification=args.classification or "UNCLASSIFIED",
        access_groups=args.access_groups,
    )

    ctx = PipelineContext()
    print(f"Converting S1000D DM {dm_path.name} ...")

    # Stages 1–3 combined: S1000D reader produces a DocumentNode directly
    doc = s1000d_reader.read(str(dm_path), ietm_root, config, ctx)

    # Apply classification override from CLI if given
    if args.classification:
        config.classification = args.classification

    output_dir = ietm_root / config.doc_id
    output_dir.mkdir(parents=True, exist_ok=True)

    _parse_heading_markers(doc, config)

    _count_tree(doc, ctx)
    print(f"  Tree: {ctx.stats['sections']} sections, "
          f"{ctx.stats['figures']} figures, "
          f"{ctx.stats['tables']} tables")

    # Stage 4: Resolve cross-references
    xref_resolver.resolve(doc, config, ctx)

    # Stage 4.5: Merge hotspots / models / media
    if args.hotspots:
        hotspot_merger.merge(doc, args.hotspots, ctx)
        _count_hotspots(doc, ctx)
        print(f"  Hotspots: {ctx.stats['hotspots']}")
    if args.models:
        hotspot_merger.merge_models(doc, args.models, ctx)
        print(f"  3D models merged from {args.models}")
    if args.media:
        hotspot_merger.merge_media(doc, args.media, ctx)
        print(f"  Media (video/PDF) merged from {args.media}")

    # Stage 5: Emit XML
    xml_emitter.emit(doc, output_dir, config, ctx)
    print(f"  XML written to {output_dir}/ietm_output.xml")

    rel_path = f"{config.doc_id}/ietm_output.xml"
    master_registry.register(ietm_root, config.doc_id, doc.title, rel_path)
    print(f"  Registered in {ietm_root}/master.xml")

    ctx.print_report()


def cmd_list(args) -> None:
    ietm_root = Path(args.ietm_root)
    manuals = master_registry.list_manuals(ietm_root)
    if not manuals:
        print("No manuals registered.")
        return
    print(f"{'docId':<20} {'title':<45} path")
    print("-" * 90)
    for m in manuals:
        print(f"{m.get('docId',''):<20} {m.get('title','')[:44]:<45} {m.get('path','')}")


def cmd_unregister(args) -> None:
    ietm_root = Path(args.ietm_root)
    removed = master_registry.unregister(ietm_root, args.doc_id)
    if removed:
        print(f"Unregistered '{args.doc_id}' from {ietm_root}/master.xml")
    else:
        print(f"'{args.doc_id}' not found in master.xml")


def cmd_add_global(args) -> None:
    """Register a global asset (prepages PDF / abbreviations CSV) with the IETM root."""
    ietm_root = Path(args.ietm_root)
    if not args.prepages and not args.abbreviations:
        print("Nothing to do — provide --prepages and/or --abbreviations.")
        return

    if args.prepages:
        rel = master_registry.register_global_asset(
            ietm_root, "prepages", Path(args.prepages), title=args.prepages_title
        )
        print(f"  Registered prepages -> {ietm_root}/{rel}")
    if args.abbreviations:
        rel = master_registry.register_global_asset(
            ietm_root, "abbreviations", Path(args.abbreviations),
            title=args.abbreviations_title,
        )
        print(f"  Registered abbreviations -> {ietm_root}/{rel}")


def main() -> None:
    _check_expiry()
    parser = argparse.ArgumentParser(
        description="DOCX → IETM Level 4 XML Pipeline",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # ── convert ──────────────────────────────────────────────────────────────
    p_conv = sub.add_parser("convert", help="Convert a .docx to IETM XML")
    p_conv.add_argument("docx",       help="Path to the .docx file")
    p_conv.add_argument("ietm_root",  help="IETM system root directory")
    p_conv.add_argument("--doc-id",   default=None, help="Override document ID")
    p_conv.add_argument("--title",    default=None, help="Override document title")
    p_conv.add_argument("--classification", default="UNCLASSIFIED",
                        help="Classification marking (default: UNCLASSIFIED)")
    p_conv.add_argument("--hotspots", default=None,
                        help="Path to hotspots JSON file")
    p_conv.add_argument("--models",   default=None,
                        help="Path to model_manifest.json for 3D model attachment")
    p_conv.add_argument("--media",    default=None,
                        help="Path to media_manifest.json for video/PDF attachment")
    p_conv.add_argument("--access-groups", default="all", dest="access_groups",
                        help="Comma-separated group names (default: all)")
    p_conv.set_defaults(func=cmd_convert)

    # ── convert-s1000d ────────────────────────────────────────────────────────
    p_s1k = sub.add_parser("convert-s1000d",
                            help="Convert an S1000D Data Module XML to IETM XML")
    p_s1k.add_argument("dm_file",    help="Path to the S1000D DM XML file")
    p_s1k.add_argument("ietm_root",  help="IETM system root directory")
    p_s1k.add_argument("--doc-id",   default=None, help="Override document ID (default: from DMC)")
    p_s1k.add_argument("--title",    default=None, help="Override document title")
    p_s1k.add_argument("--classification", default=None,
                        help="Override classification (default: from DM security element)")
    p_s1k.add_argument("--hotspots", default=None,
                        help="Path to hotspots JSON file")
    p_s1k.add_argument("--models",   default=None,
                        help="Path to model_manifest.json for 3D model attachment")
    p_s1k.add_argument("--media",    default=None,
                        help="Path to media_manifest.json for video/PDF attachment")
    p_s1k.add_argument("--access-groups", default="all", dest="access_groups",
                        help="Comma-separated group names (default: all)")
    p_s1k.set_defaults(func=cmd_convert_s1000d)

    # ── list ─────────────────────────────────────────────────────────────────
    p_list = sub.add_parser("list", help="List registered manuals")
    p_list.add_argument("ietm_root", help="IETM system root directory")
    p_list.set_defaults(func=cmd_list)

    # ── unregister ────────────────────────────────────────────────────────────
    p_unreg = sub.add_parser("unregister", help="Remove a manual from the index")
    p_unreg.add_argument("ietm_root", help="IETM system root directory")
    p_unreg.add_argument("doc_id",    help="Document ID to remove")
    p_unreg.set_defaults(func=cmd_unregister)

    # ── add-global ────────────────────────────────────────────────────────────
    p_glob = sub.add_parser(
        "add-global",
        help="Register global assets (prepages PDF / abbreviations CSV) at IETM root",
    )
    p_glob.add_argument("ietm_root", help="IETM system root directory")
    p_glob.add_argument("--prepages", default=None,
                        help="Path to the prepages PDF (shown above all documents in TOC)")
    p_glob.add_argument("--prepages-title", default="Prepages",
                        help="Display title for the prepages entry (default: Prepages)")
    p_glob.add_argument("--abbreviations", default=None,
                        help="Path to the abbreviations CSV (exposed via dashboard button)")
    p_glob.add_argument("--abbreviations-title", default="Abbreviations",
                        help="Display title for the abbreviations dialog (default: Abbreviations)")
    p_glob.set_defaults(func=cmd_add_global)

    args = parser.parse_args()
    args.func(args)


# ── Heading marker helpers ────────────────────────────────────────────────────

def _parse_heading_markers(doc, config) -> None:
    """
    Walk every SectionNode and LeafNode.  If the title contains bracketed
    tokens like [SECRET] or [ARMAMENT], strip them and record them on the node.

    Classification tokens (matching SECURITY_MARKER_RE) → node.security_class
    Other all-caps tokens (matching ACCESS_GROUP_RE)      → node.access_groups
    The rest (any access_groups not overridden) fall back to config.access_groups.
    """
    from .models import LeafGroup, SectionNode, LeafNode

    def _process_title(title: str, node):
        security_hits = SECURITY_MARKER_RE.findall(title)
        cleaned = SECURITY_MARKER_RE.sub("", title)

        group_hits = ACCESS_GROUP_RE.findall(cleaned)
        cleaned = ACCESS_GROUP_RE.sub("", cleaned).strip()

        node.title = cleaned

        if security_hits:
            # Last marker wins for classification
            node.security_class = security_hits[-1].upper().replace("  ", " ")
        if group_hits:
            node.access_groups = ",".join(g.upper() for g in group_hits)
        elif config.access_groups and config.access_groups != "all":
            # Inherit document-level access_groups if nothing explicit on node
            node.access_groups = config.access_groups

    def _walk_section(sec: SectionNode):
        _process_title(sec.title, sec)
        for child in sec.children:
            if isinstance(child, SectionNode):
                _walk_section(child)
            elif isinstance(child, LeafGroup):
                _walk_section(child.root_section)
                for leaf in child.leaves:
                    _process_title(leaf.title, leaf)

    for sec in doc.sections:
        _walk_section(sec)


# ── Stat helpers ──────────────────────────────────────────────────────────────

def _count_tree(doc, ctx) -> None:
    from .models import FigureNode, LeafGroup, SectionNode
    from .tree_builder import _RawTableBlock

    def walk(sec):
        ctx.stats["sections"] += 1
        for b in sec.blocks:
            if isinstance(b, FigureNode):
                ctx.stats["figures"] += 1
            elif isinstance(b, _RawTableBlock):
                ctx.stats["tables"] += 1
        for child in sec.children:
            if isinstance(child, SectionNode):
                walk(child)
            elif isinstance(child, LeafGroup):
                walk(child.root_section)
                for leaf in child.leaves:
                    ctx.stats["sections"] += 1
                    for b in leaf.blocks:
                        if isinstance(b, FigureNode):
                            ctx.stats["figures"] += 1
                        elif isinstance(b, _RawTableBlock):
                            ctx.stats["tables"] += 1

    for sec in doc.sections:
        walk(sec)


def _count_hotspots(doc, ctx) -> None:
    from .models import FigureNode, LeafGroup, SectionNode

    def walk_blocks(blocks):
        for b in blocks:
            if isinstance(b, FigureNode):
                ctx.stats["hotspots"] += len(b.hotspots)

    def walk(sec):
        walk_blocks(sec.blocks)
        for child in sec.children:
            if isinstance(child, SectionNode):
                walk(child)
            elif isinstance(child, LeafGroup):
                walk(child.root_section)
                for leaf in child.leaves:
                    walk_blocks(leaf.blocks)

    for sec in doc.sections:
        walk(sec)


def _rename_images(doc, output_dir: Path) -> None:
    """
    Rename extracted images to match their figure IDs (e.g. image9.png -> fig_1_1.png).
    Updates FigureNode.image_filename in place.
    """
    from .models import FigureNode, LeafGroup, SectionNode

    images_dir = output_dir / "images"
    seen: dict = {}

    def walk_blocks(blocks):
        for b in blocks:
            if isinstance(b, FigureNode) and b.image_filename != "MISSING":
                old_path = images_dir / Path(b.image_filename).name
                ext = Path(b.image_filename).suffix
                base = b.id  # e.g. "fig_1_1"

                seen[base] = seen.get(base, 0) + 1
                if seen[base] > 1:
                    base = f"{base}_{seen[base]}"

                new_name = f"{base}{ext}"
                new_path = images_dir / new_name
                if old_path.exists() and old_path != new_path:
                    if new_path.exists():
                        new_path.unlink()  # remove stale file from previous run
                    old_path.rename(new_path)
                b.image_filename = f"images/{new_name}"

    def walk(sec):
        walk_blocks(sec.blocks)
        for child in sec.children:
            if isinstance(child, SectionNode):
                walk(child)
            elif isinstance(child, LeafGroup):
                walk(child.root_section)
                for leaf in child.leaves:
                    walk_blocks(leaf.blocks)

    for sec in doc.sections:
        walk(sec)


if __name__ == "__main__":
    main()
