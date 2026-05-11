
from django.contrib.auth.decorators import login_required
from django.db.models import Exists, OuterRef, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render

from .models import ContentBlock, ContentNode, CrossReference, Document, Media

def _is_htmx(request):
    return request.headers.get("HX-Request") == "true"

def _annotate_tree_nodes(qs):
    return qs.annotate(
        has_content=Exists(
            ContentBlock.objects.filter(node=OuterRef("pk"))
        ),
        children_exist=Exists(
            ContentNode.objects.filter(parent=OuterRef("pk"))
        ),
        grandchildren_exist=Exists(
            ContentNode.objects.filter(parent__parent=OuterRef("pk"))
        ),
    )

def _get_breadcrumbs(node):
    crumbs = []
    current = node.parent
    while current:
        crumbs.append(current)
        current = current.parent
    crumbs.reverse()
    return crumbs

def _get_prev_next(node):
    navigable = ContentNode.objects.filter(
        document=node.document,
    ).exclude(
        node_type=ContentNode.LEAF,
    ).order_by("path")

    node_list = list(navigable.values_list("pk", flat=True))
    try:
        idx = node_list.index(node.pk)
    except ValueError:
        return None, None

    prev_pk = node_list[idx - 1] if idx > 0 else None
    next_pk = node_list[idx + 1] if idx < len(node_list) - 1 else None

    prev_node = ContentNode.objects.get(pk=prev_pk) if prev_pk else None
    next_node = ContentNode.objects.get(pk=next_pk) if next_pk else None
    return prev_node, next_node

def login_view(request):
    if request.method == "POST":
        from django.contrib.auth import authenticate, login
        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            if getattr(user, "role", "") == "admin":
                return redirect("admin_panel:dashboard")
            return redirect("content:viewer")
        return render(request, "login.html", {"error": "Invalid username or password"})
    return render(request, "login.html")

def logout_view(request):
    from django.contrib.auth import logout
    logout(request)
    if _is_htmx(request):
        response = HttpResponse()
        response["HX-Redirect"] = "/login/"
        return response
    return redirect("content:login")

@login_required(login_url="/login/")
def viewer(request):
    documents = Document.objects.all()

    first_doc = documents.first()
    nodes = []
    if first_doc:
        nodes = _annotate_tree_nodes(
            ContentNode.objects.filter(
                document=first_doc, parent__isnull=True,
            )
        ).order_by("order")

    return render(request, "viewer/index.html", {
        "documents": documents,
        "nodes": nodes,
    })

@login_required(login_url="/login/")
def home(request):
    documents = Document.objects.all()
    return render(request, "viewer/partials/home.html", {
        "documents": documents,
    })

@login_required(login_url="/login/")
def topic_detail(request, pk):
    node = get_object_or_404(
        ContentNode.objects.select_related("document", "parent"),
        pk=pk,
    )

    blocks = ContentBlock.objects.filter(node=node).order_by("order")
    breadcrumbs = _get_breadcrumbs(node)
    prev_node, next_node = _get_prev_next(node)

    child_sections = ContentNode.objects.filter(
        parent=node,
    ).exclude(node_type=ContentNode.LEAF_GROUP).order_by("order")

    media_items = Media.objects.filter(
        block__node=node, media_type=Media.IMAGE,
    ).select_related("block").prefetch_related("hotspots")

    leaf_nodes = []
    if node.node_type == ContentNode.LEAF_GROUP:
        leaf_nodes = ContentNode.objects.filter(
            parent=node, node_type=ContentNode.LEAF,
        ).prefetch_related("blocks").order_by("order")

        leaf_media = Media.objects.filter(
            block__node__in=leaf_nodes, media_type=Media.IMAGE,
        ).select_related("block").prefetch_related("hotspots")
        media_items = list(media_items) + list(leaf_media)

    if node.node_type == ContentNode.SECTION and not leaf_nodes:
        children = ContentNode.objects.filter(parent=node)
        if children.exists() and not ContentNode.objects.filter(parent__parent=node).exists():
            leaf_nodes = children.prefetch_related("blocks").order_by("order")
            leaf_media = Media.objects.filter(
                block__node__in=leaf_nodes, media_type=Media.IMAGE,
            ).select_related("block").prefetch_related("hotspots")
            media_items = list(media_items) + list(leaf_media)

    block_types = set(blocks.values_list("block_type", flat=True))
    if leaf_nodes:
        leaf_block_types = set(
            ContentBlock.objects.filter(node__in=leaf_nodes)
            .values_list("block_type", flat=True)
        )
        block_types |= leaf_block_types

    has_text = bool(block_types & {ContentBlock.PARA, ContentBlock.LIST})
    has_table = ContentBlock.TABLE in block_types
    has_media = bool(media_items if isinstance(media_items, list) else media_items.exists())

    context = {
        "node": node,
        "blocks": blocks,
        "breadcrumbs": breadcrumbs,
        "prev_node": prev_node,
        "next_node": next_node,
        "child_sections": child_sections,
        "media_items": media_items,
        "leaf_nodes": leaf_nodes,
        "has_text": has_text,
        "has_media": has_media,
        "has_table": has_table,
    }

    if _is_htmx(request):
        return render(request, "viewer/partials/topic.html", context)

    documents = Document.objects.all()
    first_doc = node.document
    nodes = _annotate_tree_nodes(
        ContentNode.objects.filter(
            document=first_doc, parent__isnull=True,
        )
    ).order_by("order")
    context.update({"documents": documents, "nodes": nodes})
    return render(request, "viewer/index.html", context)

@login_required(login_url="/login/")
def topic_by_xml_id(request, xml_id):
    try:
        node = ContentNode.objects.get(xml_id=xml_id)
    except ContentNode.DoesNotExist:

        media = get_object_or_404(Media, xml_id=xml_id)
        node = media.block.node

        if node.node_type == ContentNode.LEAF and node.parent:
            node = node.parent
    return topic_detail(request, node.pk)

@login_required(login_url="/login/")
def document_tree(request, doc_id):
    doc = get_object_or_404(Document, doc_id=doc_id)
    nodes = _annotate_tree_nodes(
        ContentNode.objects.filter(
            document=doc, parent__isnull=True,
        )
    ).order_by("order")
    return render(request, "viewer/partials/tree.html", {"nodes": nodes})

@login_required(login_url="/login/")
def tree_children(request, pk):
    parent = get_object_or_404(ContentNode, pk=pk)
    nodes = _annotate_tree_nodes(
        ContentNode.objects.filter(parent=parent).exclude(
            node_type=ContentNode.LEAF,
        )
    ).order_by("order")
    return render(request, "viewer/partials/tree.html", {"nodes": nodes})

@login_required(login_url="/login/")
def search(request):
    query = request.GET.get("q", "").strip()
    results = []
    if query and len(query) >= 2:

        matching_blocks = ContentBlock.objects.filter(
            Q(content_html__icontains=query) |
            Q(node__title__icontains=query),
        ).select_related("node").distinct()[:20]

        seen_nodes = set()
        for block in matching_blocks:
            if block.node.pk not in seen_nodes:
                seen_nodes.add(block.node.pk)

                text = block.content_html
                idx = text.lower().find(query.lower())
                snippet = ""
                if idx >= 0:
                    start = max(0, idx - 40)
                    end = min(len(text), idx + len(query) + 40)
                    snippet = "..." + _strip_html(text[start:end]) + "..."
                results.append({"node": block.node, "snippet": snippet})

    return render(request, "viewer/partials/search_results.html", {
        "results": results,
        "query": query,
    })

def _strip_html(text):
    import re
    return re.sub(r"<[^>]+>", "", text)

@login_required(login_url="/login/")
def dashboard(request):
    return render(request, "viewer/partials/dashboard.html", {
        "user": request.user,
    })

@login_required(login_url="/login/")
def user_bookmarks(request):

    from bookmarks.models import Bookmark
    bookmarks = Bookmark.objects.filter(
        user_id=request.user.pk,
    ).order_by("-created_at")[:50]
    return render(request, "viewer/partials/bookmarks.html", {
        "bookmarks": bookmarks,
    })

@login_required(login_url="/login/")
def user_notes(request):
    from topic_notes.models import TopicNote
    notes = TopicNote.objects.filter(
        user_id=request.user.pk,
    ).order_by("-updated_at")[:50]
    return render(request, "viewer/partials/notes.html", {
        "notes": notes,
    })
