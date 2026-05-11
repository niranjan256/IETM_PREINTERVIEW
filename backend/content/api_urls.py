from django.urls import path
from . import api_views, views_global

urlpatterns = [
    path("documents/", api_views.content_documents, name="api_documents"),
    path("tree/<str:doc_id>/", api_views.content_tree, name="api_tree"),
    path("topic/<int:pk>/", api_views.content_topic, name="api_topic"),
    path("search/", api_views.content_search, name="api_search"),
    path("resolve-xref/", api_views.resolve_xref, name="api_resolve_xref"),
    path("document-index/<str:doc_id>/", api_views.document_index, name="api_document_index"),

    path("prepages/", views_global.prepages, name="api_prepages"),
    path("abbreviations/", views_global.abbreviations, name="api_abbreviations"),
]
