from django.urls import path

from . import views

app_name = "content"

urlpatterns = [

    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),

    path("", views.viewer, name="viewer"),
    path("home/", views.home, name="home"),

    path("topic/<int:pk>/", views.topic_detail, name="topic"),
    path("topic/by-xml-id/<str:xml_id>/", views.topic_by_xml_id, name="topic_by_xml_id"),

    path("tree/document/<str:doc_id>/", views.document_tree, name="document_tree"),
    path("tree/children/<int:pk>/", views.tree_children, name="tree_children"),

    path("search/", views.search, name="search"),

    path("dashboard/", views.dashboard, name="dashboard"),
    path("dashboard/bookmarks/", views.user_bookmarks, name="user_bookmarks"),
    path("dashboard/notes/", views.user_notes, name="user_notes"),
]
