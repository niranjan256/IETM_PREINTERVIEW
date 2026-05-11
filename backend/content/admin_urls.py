from django.urls import path

from . import admin_views

app_name = "admin_panel"

urlpatterns = [
    path("", admin_views.dashboard, name="dashboard"),
    path("users/", admin_views.list_users, name="list_users"),
    path("users/add/", admin_views.add_user, name="add_user"),
    path("users/<int:pk>/edit/", admin_views.edit_user, name="edit_user"),
    path("users/<int:pk>/toggle/", admin_views.toggle_user, name="toggle_user"),
    path("users/select/", admin_views.user_select, name="user_select"),
    path("activities/", admin_views.activities, name="activities"),
    path("groups/", admin_views.list_groups, name="list_groups"),
    path("groups/add/", admin_views.add_group, name="add_group"),
    path("groups/<int:pk>/", admin_views.group_detail, name="group_detail"),
]
