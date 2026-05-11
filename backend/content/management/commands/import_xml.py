
from __future__ import annotations

import datetime
import re
import shutil
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from lxml import etree

from content.models import (
    ContentBlock, ContentNode, CrossReference, Document, Hotspot, Media,
    MeshHotspot,
)

class Command(BaseCommand):
    help = "Import IETM XML files into the content database."

    def add_arguments(self, parser):
        parser.add_argument(
            "--source", required=True,
            help="Path to master.xml or a single ietm_output.xml",
        )
        parser.add_argument(
            "--single", action="store_true",
            help="Treat --source as a single ietm_output.xml (not master.xml)",
        )
        parser.add_argument(
            "--media-dest", default="",
            help="Copy media files to this directory (default: MEDIA_ROOT/<doc_id>/)",
        )
        parser.add_argument(
            "--clear", action="store_true",
            help="Clear existing data for the document(s) before importing",
        )

    def handle(self, *args, **options):
        source = Path(options["source"]).resolve()
        if not source.exists():
            raise CommandError(f"Source file not found: {source}")

        if options["single"]:
            files = [source]
        else:
            files = self._parse_master(source)
            self._import_global_assets(source)

        total_docs = 0
        for xml_path in files:
            self.stdout.write(f"Importing {xml_path.name} ...")
            doc = self._import_document(
                xml_path,
                clear=options["clear"],
                media_dest=options["media_dest"],
            )
            self.stdout.write(self.style.SUCCESS(
                f"  {doc.doc_id}: {doc.title} — "
                f"{doc.nodes.count()} nodes, "
                f"{ContentBlock.objects.filter(node__document=doc).count()} blocks, "
                f"{doc.media.count()} media"
            ))
            total_docs += 1

        self.stdout.write(self.style.SUCCESS(f"\nDone. Imported {total_docs} document(s)."))

    def _parse_master(self, master_path: Path) -> list[Path]:
        tree = etree.parse(str(master_path))
        root = tree.getroot()
        base_dir = master_path.parent

        files = []
        for manual in root.iter("manual"):
            doc_id = manual.get("docId", "")
            path_attr = manual.get("path", "")
            if path_attr:
                xml_path = (base_dir / path_attr).resolve()
            else:
                xml_path = (base_dir / doc_id / "ietm_output.xml").resolve()
            if xml_path.exists():
                files.append(xml_path)
            else:
                self.stderr.write(self.style.WARNING(
                    f"  Skipping {doc_id}: {xml_path} not found"
                ))
        return files

    def _import_global_assets(self, master_path: Path) -> None:
        from django.conf import settings

        tree = etree.parse(str(master_path))
        root = tree.getroot()
        container = root.find("global-assets")
        if container is None:
            return

        media_root = Path(settings.MEDIA_ROOT).resolve()
        dest_dir = media_root / "_global"
        dest_dir.mkdir(parents=True, exist_ok=True)
        base_dir = master_path.parent

        for child in container:
            file_rel = child.get("file")
            if not file_rel:
                continue
            src = (base_dir / file_rel).resolve()
            if not src.exists():
                self.stderr.write(self.style.WARNING(
                    f"  Global asset {child.tag}: source {src} not found"
                ))
                continue
            dest = dest_dir / Path(file_rel).name
            shutil.copyfile(src, dest)
            self.stdout.write(self.style.SUCCESS(
                f"  Global asset {child.tag}: copied to {dest.relative_to(media_root)}"
            ))

    @transaction.atomic
    def _import_document(self, xml_path: Path, clear: bool, media_dest: str) -> Document:
        tree = etree.parse(str(xml_path))
        root = tree.getroot()

        doc_id = root.get("docId", xml_path.parent.name)
        classification = root.get("classification", "UNCLASSIFIED")
        gen_date_str = root.get("generatedDate", "")
        gen_version = root.get("generatorVersion", "1.0")

        gen_date = None
        if gen_date_str:
            try:
                gen_date = datetime.date.fromisoformat(gen_date_str)
            except ValueError:
                pass

        title = "Technical Manual"
        doc_type = "Technical Manual"
        ident = root.find("identInfo")
        if ident is not None:
            t = ident.findtext("title")
            if t:
                title = t.strip()
            dt = ident.findtext("docType")
            if dt:
                doc_type = dt.strip()

        if clear:
            Document.objects.filter(doc_id=doc_id).delete()

        doc, created = Document.objects.update_or_create(
            doc_id=doc_id,
            defaults={
                "title": title,
                "doc_type": doc_type,
                "classification": classification,
                "generated_date": gen_date,
                "generator_version": gen_version,
            },
        )

        if not created:

            doc.nodes.all().delete()
            doc.media.all().delete()

        self._node_map: dict[str, ContentNode] = {}
        self._media_map: dict[str, Media] = {}
        self._xref_queue: list[dict] = []
        self._hotspot_queue: list[dict] = []
        self._mesh_hotspot_queue: list[dict] = []
        self._media_source_dir = xml_path.parent
        self._doc = doc

        order = 0
        for section_el in root.iterchildren("section"):
            self._import_section(section_el, parent=None, order=order)
            order += 1

        self._resolve_xrefs()

        if media_dest:
            dest = Path(media_dest)
        else:
            from django.conf import settings
            dest = Path(settings.MEDIA_ROOT) / doc_id
        self._copy_media(dest)

        return doc

    def _import_section(self, el, parent, order) -> ContentNode:
        xml_id = el.get("id", "")
        number = el.get("number", "")
        level = int(el.get("level", "1"))
        title = el.get("title", "")
        path = number

        node = ContentNode.objects.create(
            document=self._doc,
            node_type=ContentNode.SECTION,
            xml_id=xml_id,
            number=number,
            title=title,
            level=level,
            parent=parent,
            path=path,
            order=order,
        )
        self._node_map[xml_id] = node

        child_order = 0
        block_order = 0
        for child in el:
            tag = child.tag
            if tag == "section":
                self._import_section(child, parent=node, order=child_order)
                child_order += 1
            elif tag == "leaf-group":
                self._import_leaf_group(child, parent=node, order=child_order)
                child_order += 1
            elif tag in ("para", "list", "figure", "table", "model3d", "video", "pdf"):
                block_order = self._import_block(child, node, block_order)

        return node

    def _import_leaf_group(self, el, parent, order) -> ContentNode:
        root_id = el.get("root", "")
        title = el.get("title", "")

        root_section_el = el.find("section")
        if not title and root_section_el is not None:
            title = root_section_el.get("title", "")

        group_node = ContentNode.objects.create(
            document=self._doc,
            node_type=ContentNode.LEAF_GROUP,
            xml_id=f"lg_{root_id}",
            number="",
            title=title,
            level=parent.level + 1 if parent else 1,
            parent=parent,
            path=f"{parent.path}.lg" if parent else "lg",
            order=order,
        )

        leaf_order = 0
        root_node = None

        if root_section_el is not None:
            root_node = self._import_leaf_from_section(root_section_el, parent=group_node, order=leaf_order)
            leaf_order += 1

        for leaf_el in el.iterchildren("leaf"):
            leaf_node = self._import_leaf(leaf_el, parent=group_node, order=leaf_order)
            if root_node is None and leaf_order == 0:
                root_node = leaf_node
            leaf_order += 1

        if root_node:
            group_node.leaf_group_root = root_node
            group_node.save(update_fields=["leaf_group_root"])

        return group_node

    def _import_leaf_from_section(self, el, parent, order) -> ContentNode:
        xml_id = el.get("id", "")
        number = el.get("number", "")
        title = el.get("title", "")

        node = ContentNode.objects.create(
            document=self._doc,
            node_type=ContentNode.LEAF,
            xml_id=xml_id,
            number=number,
            title=title,
            level=parent.level + 1 if parent else 1,
            parent=parent,
            path=number,
            order=order,
        )
        self._node_map[xml_id] = node

        block_order = 0
        for child in el:
            tag = child.tag
            if tag in ("para", "list", "figure", "table", "model3d", "video", "pdf"):
                block_order = self._import_block(child, node, block_order)

        return node

    def _import_leaf(self, el, parent, order) -> ContentNode:
        xml_id = el.get("id", "")
        number = el.get("number", "")
        title = el.get("title", "")

        node = ContentNode.objects.create(
            document=self._doc,
            node_type=ContentNode.LEAF,
            xml_id=xml_id,
            number=number,
            title=title,
            level=parent.level + 1 if parent else 1,
            parent=parent,
            path=number,
            order=order,
        )
        self._node_map[xml_id] = node

        block_order = 0
        for child in el:
            tag = child.tag
            if tag in ("para", "list", "figure", "table", "model3d", "video", "pdf"):
                block_order = self._import_block(child, node, block_order)

        return node

    def _import_block(self, el, node: ContentNode, order: int) -> int:
        tag = el.tag

        if tag == "para":
            html = self._render_para(el)
            ContentBlock.objects.create(
                node=node, block_type=ContentBlock.PARA,
                order=order, content_html=html,
            )

            self._extract_xrefs_from_element(el, node, order)
            return order + 1

        if tag == "list":
            html = self._render_list(el)
            raw = self._list_to_json(el)
            block = ContentBlock.objects.create(
                node=node, block_type=ContentBlock.LIST,
                order=order, content_html=html, raw_data=raw,
            )
            self._extract_xrefs_from_element(el, node, order)
            return order + 1

        if tag == "figure":
            html, media_obj = self._render_figure(el, node, order)
            block = ContentBlock.objects.create(
                node=node, block_type=ContentBlock.FIGURE,
                order=order, content_html=html,
            )
            if media_obj:
                media_obj.block = block
                media_obj.save(update_fields=["block"])

            self._extract_hotspots(el, media_obj)
            return order + 1

        if tag == "table":
            html = self._render_table(el)
            raw = self._table_to_json(el)
            block = ContentBlock.objects.create(
                node=node, block_type=ContentBlock.TABLE,
                order=order, content_html=html, raw_data=raw,
            )

            self._extract_table_media(el, block)
            return order + 1

        if tag == "model3d":
            return self._import_model3d(el, node, order)

        if tag == "video":
            return self._import_video(el, node, order)

        if tag == "pdf":
            return self._import_pdf(el, node, order)

        return order

    def _import_model3d(self, el, node: ContentNode, order: int) -> int:
        model_id = el.get("id", "")
        file_path = el.get("file", "")
        fmt = el.get("format", "glb")
        title_el = el.find("title")
        title = title_el.text.strip() if title_el is not None and title_el.text else el.get("title", "")

        if not file_path:
            return order

        html = (
            f'<div class="content-block model3d-reference" id="{_esc_attr(model_id)}">'
            f'<em class="model3d-caption" data-model-ref="{_esc_attr(model_id)}">'
            f'3D Model: {_esc(title)}</em></div>'
        )
        block = ContentBlock.objects.create(
            node=node, block_type=ContentBlock.MODEL3D,
            order=order, content_html=html,
            raw_data={"id": model_id, "file": file_path, "format": fmt, "title": title},
        )

        media_obj = Media.objects.create(
            document=self._doc,
            block=block,
            media_type=Media.MODEL_3D,
            file_path=file_path,
            original_filename=file_path.split("/")[-1] if "/" in file_path else file_path,
            xml_id=model_id,
            title=title,
            format=fmt,
        )
        self._media_map[model_id] = media_obj

        for mh in el.iterchildren("meshHotspot"):
            self._mesh_hotspot_queue.append({
                "media": media_obj,
                "mesh_name": mh.get("meshName", ""),
                "target_xml_id": mh.get("target", ""),
                "text": mh.get("text", ""),
            })

        return order + 1

    def _import_video(self, el, node: ContentNode, order: int) -> int:
        video_id = el.get("id", "")
        file_path = el.get("file", "")
        title = el.get("title", "")

        if not file_path:
            return order

        html = (
            f'<div class="content-block video-reference" id="{_esc_attr(video_id)}">'
            f'<em class="video-caption" data-video-ref="{_esc_attr(video_id)}">'
            f'Video: {_esc(title)}</em></div>'
        )
        block = ContentBlock.objects.create(
            node=node, block_type=ContentBlock.VIDEO,
            order=order, content_html=html,
            raw_data={"id": video_id, "file": file_path, "title": title},
        )
        Media.objects.create(
            document=self._doc,
            block=block,
            media_type=Media.VIDEO,
            file_path=file_path,
            original_filename=file_path.split("/")[-1] if "/" in file_path else file_path,
            xml_id=video_id,
            title=title,
        )
        return order + 1

    def _import_pdf(self, el, node: ContentNode, order: int) -> int:
        pdf_id = el.get("id", "")
        file_path = el.get("file", "")
        title = el.get("title", "")

        if not file_path:
            return order

        html = (
            f'<div class="content-block pdf-reference" id="{_esc_attr(pdf_id)}">'
            f'<em class="pdf-caption" data-pdf-ref="{_esc_attr(pdf_id)}">'
            f'PDF: {_esc(title)}</em></div>'
        )
        block = ContentBlock.objects.create(
            node=node, block_type=ContentBlock.PDF,
            order=order, content_html=html,
            raw_data={"id": pdf_id, "file": file_path, "title": title},
        )
        Media.objects.create(
            document=self._doc,
            block=block,
            media_type=Media.PDF,
            file_path=file_path,
            original_filename=file_path.split("/")[-1] if "/" in file_path else file_path,
            xml_id=pdf_id,
            title=title,
        )
        return order + 1

    def _render_para(self, el) -> str:
        return f"<p>{self._render_inline(el)}</p>"

    def _render_inline(self, el) -> str:
        parts = []
        if el.text:
            parts.append(_esc(el.text))
        for child in el:
            tag = child.tag
            if tag == "emphasis":
                parts.append(self._render_emphasis(child))
            elif tag == "xref":
                target = child.get("target", "")
                ref_type = child.get("refType", "")
                display = child.text or ""
                parts.append(
                    f'<a class="xref" data-target="{_esc_attr(target)}" '
                    f'data-ref-type="{_esc_attr(ref_type)}" '
                    f'href="#">'
                    f'{_esc(display)}</a>'
                )
            elif tag == "unresolved":
                display = child.text or ""
                parts.append(
                    f'<span class="xref-missing" '
                    f'title="Unresolved reference: {_esc_attr(child.get("original", ""))}">'
                    f'{_esc(display)}</span>'
                )
            else:

                if child.text:
                    parts.append(_esc(child.text))
            if child.tail:
                parts.append(_esc(child.tail))
        return "".join(parts)

    def _render_emphasis(self, el) -> str:
        types = (el.get("type") or "").split()
        inner = ""
        if el.text:
            inner = _esc(el.text)

        for child in el:
            if child.tag == "xref":
                target = child.get("target", "")
                ref_type = child.get("refType", "")
                display = child.text or ""
                inner += (
                    f'<a class="xref" data-target="{_esc_attr(target)}" '
                    f'data-ref-type="{_esc_attr(ref_type)}" '
                    f'href="#">'
                    f'{_esc(display)}</a>'
                )
            elif child.text:
                inner += _esc(child.text)
            if child.tail:
                inner += _esc(child.tail)

        html = inner
        if "underline" in types:
            html = f"<u>{html}</u>"
        if "italic" in types:
            html = f"<em>{html}</em>"
        if "bold" in types:
            html = f"<strong>{html}</strong>"
        return html

    def _render_list(self, el) -> str:
        list_type = el.get("type", "alpha")
        tag, attrs = _list_html_tag(list_type)
        items_html = []
        for item_el in el.iterchildren("item"):
            items_html.append(self._render_list_item(item_el))
        return f"<{tag}{attrs}>{''.join(items_html)}</{tag}>"

    def _render_list_item(self, el) -> str:
        inner = self._render_inline(el)
        label = el.get("label", "")

        if label:

            escaped = re.escape(label)
            patterns = [
                r'^(\s*)[(](\s*)' + escaped + r'(\s*)[)](\s*)',
                r'^(\s*)' + escaped + r'[)](\s*)',
                r'^(\s*)' + escaped + r'[.](\s*)',
                r'^(\s*)' + escaped + r'(\s+)',
            ]
            for pat in patterns:
                m = re.match(pat, inner, re.IGNORECASE)
                if m:
                    inner = inner[m.end():]
                    break
        else:

            blind_re = re.compile(
                r'^(\s*)(?:[(](\s*)[a-z]{1,4}(\s*)[)]|[a-z]{1,4}[)]|[a-z]{1,4}[.])(\s*)'
                r'|^(\s*)(?:[(](\s*)[ivxlc]+(\s*)[)]|[ivxlc]+[)]|[ivxlc]+[.])(\s*)'
                r'|^(\s*)(?:[(](\s*)\d+(\s*)[)]|\d+[)]|\d+[.])(\s*)',
                re.IGNORECASE,
            )
            inner = blind_re.sub("", inner, count=1)

        for child in el:
            if child.tag == "list":
                inner += self._render_list(child)
        return f"<li>{inner}</li>"

    def _render_figure(self, el, node, order) -> tuple[str, Media | None]:
        fig_id = el.get("id", "")
        fig_number = el.get("number", "")
        title_el = el.find("title")
        fig_title = title_el.text.strip() if title_el is not None and title_el.text else ""
        graphic_el = el.find("graphic")
        src = graphic_el.get("src", "") if graphic_el is not None else ""

        media_obj = None
        if src:
            media_obj = Media.objects.create(
                document=self._doc,
                media_type=Media.IMAGE,
                file_path=src,
                original_filename=src.split("/")[-1] if "/" in src else src,
                xml_id=fig_id,
                number=fig_number,
                title=fig_title,
            )
            self._media_map[fig_id] = media_obj

        caption = f"Figure {fig_number}" if fig_number else ""
        if caption and fig_title:
            caption += f": {fig_title}"
        elif fig_title:
            caption = fig_title
        else:
            caption = caption or "[Untitled Figure]"

        html = (
            f'<div class="content-block figure-reference" id="{_esc_attr(fig_id)}">'
            f'<em class="figure-caption" data-img-ref="{_esc_attr(fig_id)}">'
            f'{_esc(caption)}</em></div>'
        )
        return html, media_obj

    def _render_table(self, el) -> str:
        tbl_id = el.get("id", "")
        tbl_number = el.get("number", "")
        title_el = el.find("title")
        tbl_title = title_el.text.strip() if title_el is not None and title_el.text else ""

        parts = [f'<div class="table-wrapper text-panel-table" id="{_esc_attr(tbl_id)}">']

        if tbl_title:
            caption = f"Table {tbl_number}" if tbl_number else ""
            if caption:
                caption += f" — {tbl_title}"
            else:
                caption = tbl_title
            parts.append(f'  <p class="table-caption" data-table-ref="{_esc_attr(tbl_id)}">{_esc(caption)}</p>')

        tgroup = el.find("tgroup")
        if tgroup is None:
            parts.append('  <p class="error">[Table data missing]</p>')
            parts.append('</div>')
            return "\n".join(parts)

        col_count = int(tgroup.get("cols", "1"))
        parts.append(f'  <table class="cals-table" data-cols="{col_count}">')

        thead = tgroup.find("thead")
        if thead is not None:
            parts.append("    <thead>")
            for row_el in thead.iterchildren("row"):
                parts.append(self._render_table_row(row_el, col_count))
            parts.append("    </thead>")

        tbody = tgroup.find("tbody")
        if tbody is not None:
            parts.append("    <tbody>")
            for row_el in tbody.iterchildren("row"):
                parts.append(self._render_table_row(row_el, col_count))
            parts.append("    </tbody>")

        parts.append("  </table>")
        parts.append("</div>")
        return "\n".join(parts)

    def _render_table_row(self, row_el, col_count: int = 1) -> str:
        cells = []
        for entry in row_el.iterchildren("entry"):
            attrs = ""
            colspan = 1
            namest = entry.get("namest", "")
            nameend = entry.get("nameend", "")
            if namest and nameend:
                start = int(namest.replace("col", ""))
                end = int(nameend.replace("col", ""))
                colspan = end - start + 1
                if colspan > 1:
                    attrs += f' colspan="{colspan}"'
            morerows = entry.get("morerows", "")
            if morerows and int(morerows) > 0:
                attrs += f' rowspan="{int(morerows) + 1}"'

            css_class = ' class="spanning-header"' if colspan == col_count else ""

            inner = self._render_inline(entry)

            for child in entry:
                if child.tag == "list":
                    inner += self._render_list(child)

            for child in entry:
                if child.tag == "graphic":
                    src = child.get("src", "")
                    if src:
                        inner += (
                            f'<img src="/media/{_esc_attr(self._doc.doc_id)}/{_esc_attr(src)}" '
                            f'class="table-graphic" loading="lazy">'
                        )
            cells.append(f"<td{attrs}{css_class}>{inner}</td>")
        return f"      <tr>{''.join(cells)}</tr>"

    def _list_to_json(self, el) -> dict:
        list_type = el.get("type", "alpha")
        items = []
        for item_el in el.iterchildren("item"):
            item = {
                "label": item_el.get("label", ""),
                "text": self._element_text_content(item_el),
            }

            for child in item_el:
                if child.tag == "list":
                    item["sub_list"] = self._list_to_json(child)
            items.append(item)
        return {"type": list_type, "items": items}

    def _table_to_json(self, el) -> dict:
        tbl_id = el.get("id", "")
        tbl_number = el.get("number", "")
        title_el = el.find("title")
        tbl_title = title_el.text.strip() if title_el is not None and title_el.text else ""

        tgroup = el.find("tgroup")
        cols = int(tgroup.get("cols", "1")) if tgroup is not None else 1

        result = {
            "id": tbl_id, "number": tbl_number, "title": tbl_title, "cols": cols,
            "header_rows": [], "body_rows": [],
        }

        if tgroup is not None:
            thead = tgroup.find("thead")
            if thead is not None:
                for row_el in thead.iterchildren("row"):
                    result["header_rows"].append(self._row_to_json(row_el))
            tbody = tgroup.find("tbody")
            if tbody is not None:
                for row_el in tbody.iterchildren("row"):
                    result["body_rows"].append(self._row_to_json(row_el))

        return result

    def _row_to_json(self, row_el) -> list:
        cells = []
        for entry in row_el.iterchildren("entry"):
            cell = {"text": self._element_text_content(entry)}
            namest = entry.get("namest", "")
            nameend = entry.get("nameend", "")
            if namest and nameend:
                start = int(namest.replace("col", ""))
                end = int(nameend.replace("col", ""))
                cell["colspan"] = end - start + 1
            morerows = entry.get("morerows", "")
            if morerows:
                cell["rowspan"] = int(morerows) + 1

            graphics = []
            for child in entry:
                if child.tag == "graphic":
                    graphics.append(child.get("src", ""))
            if graphics:
                cell["graphics"] = graphics
            cells.append(cell)
        return cells

    def _element_text_content(self, el) -> str:
        return "".join(el.itertext()).strip()

    def _extract_xrefs_from_element(self, el, node, block_order):
        for xref in el.iter("xref"):
            self._xref_queue.append({
                "node": node,
                "block_order": block_order,
                "target_xml_id": xref.get("target", ""),
                "ref_type": xref.get("refType", ""),
                "display_text": xref.text or "",
            })

    def _extract_hotspots(self, fig_el, media_obj):
        if media_obj is None:
            return
        hotspots_el = fig_el.find("hotspots")
        if hotspots_el is None:
            return
        for hs in hotspots_el.iterchildren("hotspot"):
            self._hotspot_queue.append({
                "media": media_obj,
                "x": int(hs.get("x", "0")),
                "y": int(hs.get("y", "0")),
                "width": int(hs.get("w", "0")),
                "height": int(hs.get("h", "0")),
                "target_xml_id": hs.get("target", ""),
                "label": hs.get("text", ""),
            })

    def _extract_table_media(self, tbl_el, block):
        for graphic in tbl_el.iter("graphic"):
            src = graphic.get("src", "")
            if src:
                Media.objects.create(
                    document=self._doc,
                    block=block,
                    media_type=Media.IMAGE,
                    file_path=src,
                    original_filename=src.split("/")[-1] if "/" in src else src,
                )

    def _resolve_xrefs(self):

        xref_objs = []
        for xr in self._xref_queue:

            block = ContentBlock.objects.filter(
                node=xr["node"], order=xr["block_order"]
            ).first()
            if not block:
                continue

            target_node = self._node_map.get(xr["target_xml_id"])
            target_media = self._media_map.get(xr["target_xml_id"])

            xref_objs.append(CrossReference(
                source_block=block,
                ref_type=xr["ref_type"],
                display_text=xr["display_text"],
                target_xml_id=xr["target_xml_id"],
                target_node=target_node,
                target_media=target_media,
            ))
        if xref_objs:
            CrossReference.objects.bulk_create(xref_objs)

        hs_objs = []
        for hs in self._hotspot_queue:
            target_node = self._node_map.get(hs["target_xml_id"])
            hs_objs.append(Hotspot(
                media=hs["media"],
                x=hs["x"],
                y=hs["y"],
                width=hs["width"],
                height=hs["height"],
                target_node=target_node,
                target_xml_id=hs["target_xml_id"],
                label=hs["label"],
            ))
        if hs_objs:
            Hotspot.objects.bulk_create(hs_objs)

        mh_objs = []
        for mh in self._mesh_hotspot_queue:
            target_node = self._node_map.get(mh["target_xml_id"])
            mh_objs.append(MeshHotspot(
                media=mh["media"],
                mesh_name=mh["mesh_name"],
                target_node=target_node,
                target_xml_id=mh["target_xml_id"],
                text=mh["text"],
            ))
        if mh_objs:
            MeshHotspot.objects.bulk_create(mh_objs)

    def _copy_media(self, dest_dir: Path):
        dest_dir.mkdir(parents=True, exist_ok=True)
        copied = 0
        for media in Media.objects.filter(document=self._doc):
            src = self._media_source_dir / media.file_path
            if src.exists():
                dst = dest_dir / media.file_path
                dst.parent.mkdir(parents=True, exist_ok=True)
                if not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime:
                    shutil.copy2(src, dst)
                    copied += 1
        if copied:
            self.stdout.write(f"  Copied {copied} media files to {dest_dir}")

def _esc(text: str) -> str:
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))

def _esc_attr(text: str) -> str:
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))

def _list_html_tag(list_type: str) -> tuple[str, str]:
    if list_type == "alpha":
        return "ol", ' type="a"'
    if list_type == "roman":
        return "ol", ' type="i"'
    if list_type == "numbered":
        return "ol", ""

    return "ul", ""
