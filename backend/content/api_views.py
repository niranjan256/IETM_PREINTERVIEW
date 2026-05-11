
import re

from django.db.models import Count, Q
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.permissions import IsAuthenticated

from .models import ContentBlock, ContentNode, Document, Media, MeshHotspot

def _strip_html(text):
    return re.sub(r"<[^>]+>", "", text)

def _get_breadcrumbs(node):
    crumbs = []
    current = node.parent
    while current:
        crumbs.append({"id": current.pk, "title": current.title})
        current = current.parent
    crumbs.reverse()
    return crumbs

def _doc_order_pks(document, navigable_pks):
    rows = (
        ContentNode.objects.filter(document=document)
        .exclude(node_type=ContentNode.LEAF)
        .order_by("parent_id", "order")
        .values_list("id", "parent_id")
    )

    children_map: dict[int | None, list[int]] = {}
    for pk, parent_pk in rows:
        children_map.setdefault(parent_pk, []).append(pk)

    navigable_set = set(navigable_pks)
    result: list[int] = []

    def walk(pk):
        if pk in navigable_set:
            result.append(pk)
        for child_pk in children_map.get(pk, []):
            walk(child_pk)

    for root_pk in children_map.get(None, []):
        walk(root_pk)

    return result

_MEDIA_TYPE_MAP = {
    Media.IMAGE: "image",
    Media.MODEL_3D: "model3d",
    Media.VIDEO: "video",
    Media.PDF: "pdf",
}

def _serialize_media(m):
    item = {
        "id": m.pk,
        "type": _MEDIA_TYPE_MAP.get(m.media_type, m.media_type),
        "url": f"/media/{m.document.doc_id}/{m.file_path}",
        "title": m.title or m.original_filename,
        "xmlId": m.xml_id,
    }
    if m.media_type == Media.IMAGE:
        item["hotspots"] = [
            {
                "x": h.x, "y": h.y, "width": h.width, "height": h.height,
                "label": h.label,
                "targetNodeId": h.target_node_id,
                "targetXmlId": h.target_xml_id,
            }
            for h in m.hotspots.all()
        ]
    elif m.media_type == Media.MODEL_3D:
        item["meshHotspots"] = [
            {
                "meshName": mh.mesh_name,
                "text": mh.text,
                "targetNodeId": mh.target_node_id,
                "targetXmlId": mh.target_xml_id,
            }
            for mh in m.mesh_hotspots.all()
        ]
    return item

def _get_prev_next(node):

    navigable_qs = (
        ContentNode.objects.filter(document=node.document)
        .exclude(node_type=ContentNode.LEAF)
        .annotate(direct_block_count=Count("blocks"))
        .filter(
            Q(node_type=ContentNode.LEAF_GROUP) |
            Q(direct_block_count__gt=0)
        )
        .values_list("id", flat=True)
    )
    navigable_pks = set(navigable_qs)
    node_list = _doc_order_pks(node.document, navigable_pks)

    try:
        idx = node_list.index(node.pk)
    except ValueError:
        return None, None, None

    prev_pk = node_list[idx - 1] if idx > 0 else None
    next_pk = node_list[idx + 1] if idx < len(node_list) - 1 else None

    prev_node = ContentNode.objects.get(pk=prev_pk) if prev_pk else None
    next_node = ContentNode.objects.get(pk=next_pk) if next_pk else None

    page_info = {"current": idx + 1, "total": len(node_list)}
    return prev_node, next_node, page_info

@api_view(["GET"])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def content_tree(request, doc_id):
    try:
        doc = Document.objects.get(doc_id=doc_id)
    except Document.DoesNotExist:
        return JsonResponse({"error": "Document not found"}, status=404)

    nodes = ContentNode.objects.filter(
        document=doc,
    ).exclude(
        node_type=ContentNode.LEAF,
    ).annotate(
        block_count=Count("blocks"),
    ).order_by("parent_id", "order").values(
        "id", "parent_id", "title", "node_type", "level", "order", "path", "block_count"
    )

    result = [
        {
            "id": n["id"],
            "parentId": n["parent_id"],
            "title": n["title"],
            "nodeType": n["node_type"],
            "level": n["level"],
            "order": n["order"],
            "path": n["path"],

            "hasContent": n["node_type"] == ContentNode.LEAF_GROUP or n["block_count"] > 0,
        }
        for n in nodes
    ]

    empty_lg_ids = [r["id"] for r in result if r["nodeType"] == "leaf_group" and not r["title"]]
    if empty_lg_ids:
        leaf_titles = {}
        leaves = ContentNode.objects.filter(
            parent_id__in=empty_lg_ids,
            node_type=ContentNode.LEAF,
        ).order_by("parent_id", "order").values_list("parent_id", "title")
        for parent_id, title in leaves:
            leaf_titles.setdefault(parent_id, []).append(title)
        for item in result:
            if item["id"] in leaf_titles and not item["title"]:
                titles = leaf_titles[item["id"]]
                item["title"] = titles[0]

    return JsonResponse(result, safe=False)

@api_view(["GET"])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def content_topic(request, pk):
    try:
        node = ContentNode.objects.select_related("document", "parent").get(pk=pk)
    except ContentNode.DoesNotExist:
        return JsonResponse({"error": "Topic not found"}, status=404)

    if node.node_type == ContentNode.LEAF and node.parent is not None:
        node = ContentNode.objects.select_related("document", "parent").get(pk=node.parent.pk)

    leaf_nodes = []
    if node.node_type == ContentNode.LEAF_GROUP:
        leaf_nodes = list(
            ContentNode.objects.filter(
                parent=node, node_type=ContentNode.LEAF,
            ).prefetch_related("blocks").order_by("order")
        )
    elif node.node_type == ContentNode.SECTION:
        children = ContentNode.objects.filter(parent=node)
        if children.exists() and not ContentNode.objects.filter(parent__parent=node).exists():
            leaf_nodes = list(children.prefetch_related("blocks").order_by("order"))

    node_ids = [node.pk] + [l.pk for l in leaf_nodes]

    media_qs = Media.objects.filter(
        block__node__in=node_ids,
    ).exclude(
        block__block_type=ContentBlock.TABLE,
    ).select_related("block", "document").prefetch_related(
        "hotspots", "mesh_hotspots__target_node"
    )
    media_by_block = {}
    for m in media_qs:
        if m.block_id is not None:
            media_by_block[m.block_id] = _serialize_media(m)

    def _block_dict(b, leaf_xml_id=""):
        media = media_by_block.get(b.pk)
        d = {
            "blockType": b.block_type,
            "contentHtml": b.content_html,
            "blockId": b.pk,

            "xmlId": media["xmlId"] if media else "",
        }
        if leaf_xml_id:
            d["leafXmlId"] = leaf_xml_id
        if media is not None:
            d["media"] = media
        return d

    heading_parts = [node.number or "", node.title]
    heading_text = " ".join(p for p in heading_parts if p).strip()
    blocks = [{
        "blockType": "heading",
        "contentHtml": f'<h2 class="section-title">{heading_text}</h2>',
        "blockId": None,
        "xmlId": node.xml_id,
    }]

    for b in ContentBlock.objects.filter(node=node).order_by("order"):
        blocks.append(_block_dict(b))

    for leaf in leaf_nodes:
        leaf_parts = [leaf.number or "", leaf.title]
        leaf_text = " ".join(p for p in leaf_parts if p).strip()

        blocks.append({
            "blockType": "leaf_heading",
            "contentHtml": (
                f'<h3 id="{leaf.xml_id}" class="leaf-title topic-content-wrapper">{leaf_text}</h3>'
            ),
            "blockId": None,
            "xmlId": leaf.xml_id,
            "leafXmlId": leaf.xml_id,
        })
        for b in leaf.blocks.order_by("order"):
            blocks.append(_block_dict(b, leaf_xml_id=leaf.xml_id))

    breadcrumbs = _get_breadcrumbs(node)
    prev_node, next_node, page_info = _get_prev_next(node)

    return JsonResponse({
        "node": {
            "id": node.pk,
            "title": node.title,
            "nodeType": node.node_type,
            "path": node.path,
            "number": node.number,
            "xmlId": node.xml_id,
        },
        "doc_pk": node.document_id,
        "blocks": blocks,
        "breadcrumbs": breadcrumbs,
        "prevNode": {"id": prev_node.pk, "title": prev_node.title} if prev_node else None,
        "nextNode": {"id": next_node.pk, "title": next_node.title} if next_node else None,
        "pageInfo": page_info,
    })

@api_view(["GET"])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def content_search(request):
    query = request.GET.get("q", "").strip()
    mode = request.GET.get("mode", "text").strip()
    if not query or len(query) < 2:
        return JsonResponse([], safe=False)

    results = []
    seen_nodes = set()

    if mode == "figure":

        media_qs = Media.objects.filter(
            title__icontains=query,
            media_type=Media.IMAGE,
        ).select_related("block__node")[:20]
        for m in media_qs:
            node = m.block.node if m.block else None
            if not node or node.pk in seen_nodes:
                continue

            nav = node
            while nav and nav.node_type == ContentNode.LEAF:
                nav = nav.parent
            if not nav:
                continue
            seen_nodes.add(nav.pk)
            results.append({
                "nodeId": nav.pk,
                "nodeTitle": nav.title,
                "snippet": m.title,
                "anchorId": m.xml_id,
            })

    elif mode == "component":

        nodes = ContentNode.objects.filter(
            title__icontains=query,
            node_type__in=[ContentNode.LEAF_GROUP, ContentNode.LEAF, ContentNode.SECTION],
        )[:20]
        for n in nodes:
            nav = n
            while nav and nav.node_type == ContentNode.LEAF:
                nav = nav.parent
            if not nav or nav.pk in seen_nodes:
                continue
            seen_nodes.add(nav.pk)
            results.append({
                "nodeId": nav.pk,
                "nodeTitle": nav.title,
                "snippet": n.title if n.pk != nav.pk else "",
            })

    elif mode == "headings":

        nodes = ContentNode.objects.filter(
            title__icontains=query,
        ).select_related("document", "parent")[:40]
        for n in nodes:

            nav = n
            while nav and nav.node_type == ContentNode.LEAF:
                nav = nav.parent
            if not nav or nav.pk in seen_nodes:
                continue
            seen_nodes.add(nav.pk)
            doc_label = nav.document.doc_id.replace("_", " ") if nav.document else ""
            snippet = n.title if n.pk != nav.pk else ""
            results.append({
                "nodeId": nav.pk,
                "nodeTitle": nav.title,
                "snippet": f"{doc_label} — {snippet}" if snippet else doc_label,
                "anchorId": n.xml_id,
            })

    else:

        matching_blocks = ContentBlock.objects.filter(
            Q(content_html__icontains=query) | Q(node__title__icontains=query),
        ).select_related("node").distinct()[:20]

        for block in matching_blocks:
            if block.node.pk in seen_nodes:
                continue
            seen_nodes.add(block.node.pk)
            text = block.content_html
            idx = text.lower().find(query.lower())
            snippet = ""
            if idx >= 0:
                start = max(0, idx - 40)
                end = min(len(text), idx + len(query) + 40)
                snippet = "…" + _strip_html(text[start:end]) + "…"
            results.append({
                "nodeId": block.node.pk,
                "nodeTitle": block.node.title,
                "snippet": snippet,
            })

    return JsonResponse(results, safe=False)

@api_view(["GET"])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def resolve_xref(request):
    xml_id = request.GET.get("xml_id", "").strip()
    if not xml_id:
        return JsonResponse({"error": "xml_id required"}, status=400)

    node = ContentNode.objects.filter(xml_id=xml_id).select_related("parent").first()

    if not node:
        media = Media.objects.filter(xml_id=xml_id).select_related("block__node__parent").first()
        if media and media.block:
            node = media.block.node

    if not node:
        block = ContentBlock.objects.filter(
            content_html__contains=f'id="{xml_id}"'
        ).select_related("node__parent").first()
        if block:
            node = block.node

    if not node:
        return JsonResponse({"error": "Target not found"}, status=404)

    navigable = node
    while navigable and navigable.node_type == ContentNode.LEAF:
        navigable = navigable.parent

    if not navigable:
        return JsonResponse({"error": "No navigable node found"}, status=404)

    return JsonResponse({
        "nodeId": navigable.pk,
        "title": navigable.title,
    })

@api_view(["GET"])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def content_documents(request):
    docs = Document.objects.all().values("doc_id", "title", "doc_type", "classification")
    return JsonResponse(list(docs), safe=False)

@api_view(["GET"])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def document_index(request, doc_id):
    try:
        doc = Document.objects.get(doc_id=doc_id)
    except Document.DoesNotExist:
        return JsonResponse({"error": "Document not found"}, status=404)

    from .models import Media
    media_qs = (
        Media.objects.filter(
            document=doc,
            media_type=Media.IMAGE,
        )
        .exclude(xml_id="")
        .select_related("block__node__parent")
        .order_by("number")
    )

    figures = []
    for m in media_qs:
        if not m.block:
            continue

        node = m.block.node
        while node and node.node_type == ContentNode.LEAF:
            node = node.parent
        if not node:
            continue
        figures.append({
            "xmlId": m.xml_id,
            "number": m.number,
            "title": m.title or m.original_filename,
            "nodeId": node.pk,
            "nodeTitle": node.title,
        })

    tables_qs = (
        ContentBlock.objects.filter(
            node__document=doc,
            block_type=ContentBlock.TABLE,
        )
        .exclude(raw_data=None)
        .select_related("node__parent")
        .order_by("node__path", "order")
    )

    tables = []
    for b in tables_qs:
        raw = b.raw_data or {}
        tbl_id = raw.get("id", "")
        tbl_number = raw.get("number", "")
        tbl_title = raw.get("title", "")
        if not (tbl_id or tbl_title):
            continue
        node = b.node
        while node and node.node_type == ContentNode.LEAF:
            node = node.parent
        if not node:
            continue
        tables.append({
            "xmlId": tbl_id,
            "number": tbl_number,
            "title": tbl_title,
            "nodeId": node.pk,
            "nodeTitle": node.title,
        })

    return JsonResponse({"docId": doc_id, "figures": figures, "tables": tables})
