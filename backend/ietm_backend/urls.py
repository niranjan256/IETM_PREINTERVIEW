
import os

from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path, re_path

from . import views

_api_patterns = [
    path("health", views.health, name="health"),
    path("dbtest", views.dbtest, name="dbtest"),
    path("protected", views.protected, name="protected"),

    path("api/content/", include("content.api_urls")),

    path("api/auth/", include("auth_api.urls")),
    path("api/bookmarks/", include("bookmarks.urls")),
    path("api/notes/", include("notes.urls")),
    path("api/topic-notes/", include("topic_notes.urls")),
    path("api/search/", include("search.urls")),
    path("api/activity/", include("activity.urls")),
    path("api/admin/", include("admin_api.urls")),
    path("api/groups/", include("groups_api.urls")),
    path("api/departments", include("groups_api.urls_dept")),

    path("api/printLogs", views.print_logs, name="print_logs"),
    path("api/model-hotspots/<str:modelName>", views.model_hotspots, name="model_hotspots"),
    path("api/image-hotspots/<str:imageName>", views.image_hotspots, name="image_hotspots"),
]

if os.getenv("SERVE_SPA") == "1":

    from .serve_spa import serve_react
    urlpatterns = _api_patterns + [
        re_path(r"^(?!api/|static/|media/|admin/).*$", serve_react),
    ]
else:

    urlpatterns = [
        path("", include("content.urls")),
        path("admin-panel/", include("content.admin_urls")),
    ] + _api_patterns

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
