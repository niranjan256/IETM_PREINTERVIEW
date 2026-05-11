
from functools import wraps

import bcrypt
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import HttpResponse, HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render

from auth_api.models import User
from content.models import Document

def admin_required(view_func):
    @wraps(view_func)
    @login_required(login_url="/login/")
    def wrapper(request, *args, **kwargs):
        if getattr(request.user, "role", "") != "admin":
            return HttpResponseForbidden("Admin access required.")
        return view_func(request, *args, **kwargs)
    return wrapper

def _is_htmx(request):
    return request.headers.get("HX-Request") == "true"

def _render(request, template, context):
    if _is_htmx(request):
        return render(request, template, context)
    context["partial"] = template
    return render(request, "admin_panel/base_with_content.html", context)

def _get_departments():
    return list(
        User.objects.values_list("department", flat=True)
        .exclude(department__isnull=True)
        .exclude(department="")
        .distinct()
    )

@admin_required
def dashboard(request):
    total_users = User.objects.count()
    active_users = User.objects.filter(is_active=True).count()
    inactive_users = total_users - active_users
    total_documents = Document.objects.count()

    departments = []
    for dept in _get_departments():
        count = User.objects.filter(department=dept).count()
        departments.append({"name": dept, "count": count})

    chart_data = {
        "active": active_users,
        "inactive": inactive_users,
        "departments": departments,
    }

    context = {
        "active_page": "dashboard",
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": inactive_users,
        "total_documents": total_documents,
        "department_count": len(departments),
        "chart_data": chart_data,
    }

    return _render(request, "admin_panel/dashboard.html", context)

@admin_required
def list_users(request):
    query = request.GET.get("q", "").strip()
    status_filter = request.GET.get("status", "")

    users = User.objects.all().order_by("username")
    if query:
        users = users.filter(username__icontains=query)
    if status_filter == "active":
        users = users.filter(is_active=True)
    elif status_filter == "inactive":
        users = users.filter(Q(is_active=False) | Q(is_active__isnull=True))

    context = {
        "active_page": "list-users",
        "users": users,
        "query": query,
        "status_filter": status_filter,
    }

    return _render(request, "admin_panel/list_users.html", context)

@admin_required
def add_user(request):
    departments = _get_departments()
    context = {
        "active_page": "add-user",
        "departments": departments,
        "editing": False,
    }

    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")
        role = request.POST.get("role", "user")
        department = request.POST.get("department", "")
        is_active = "is_active" in request.POST

        if not username or not password:
            context["error_message"] = "Username and password are required."
            return _render(request, "admin_panel/add_user.html", context)

        if User.objects.filter(username=username).exists():
            context["error_message"] = f"Username '{username}' already exists."
            return _render(request, "admin_panel/add_user.html", context)

        password_hash = bcrypt.hashpw(
            password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")

        User.objects.create(
            username=username,
            password_hash=password_hash,
            role=role,
            department=department or None,
            is_active=is_active,
        )
        context["success_message"] = f"User '{username}' created successfully."
        return _render(request, "admin_panel/add_user.html", context)

    return _render(request, "admin_panel/add_user.html", context)

@admin_required
def edit_user(request, pk):
    edit_user = get_object_or_404(User, pk=pk)
    departments = _get_departments()
    context = {
        "active_page": "add-user",
        "departments": departments,
        "editing": True,
        "edit_user": edit_user,
    }

    if request.method == "POST":
        role = request.POST.get("role", edit_user.role)
        department = request.POST.get("department", "")
        is_active = "is_active" in request.POST
        password = request.POST.get("password", "")

        edit_user.role = role
        edit_user.department = department or None
        edit_user.is_active = is_active

        if password:
            edit_user.password_hash = bcrypt.hashpw(
                password.encode("utf-8"), bcrypt.gensalt()
            ).decode("utf-8")

        edit_user.save()
        context["success_message"] = f"User '{edit_user.username}' updated."
        return _render(request, "admin_panel/add_user.html", context)

    return _render(request, "admin_panel/add_user.html", context)

@admin_required
def toggle_user(request, pk):
    user = get_object_or_404(User, pk=pk)
    user.is_active = not user.is_active
    user.save()
    return list_users(request)

@admin_required
def list_groups(request):
    context = {"active_page": "list-groups"}
    return _render(request, "admin_panel/list_groups.html", context)

@admin_required
def add_group(request):
    try:
        from groups_api.models import Department
        departments = Department.objects.all()
    except Exception:
        departments = []
    context = {"active_page": "add-group", "departments": departments}
    return _render(request, "admin_panel/add_group.html", context)

@admin_required
def group_detail(request, pk):
    try:
        from groups_api.models import UserGroup, GroupUser
        group = get_object_or_404(UserGroup, pk=pk)
        member_ids = GroupUser.objects.filter(group=group).values_list("user_id", flat=True)
        members = User.objects.filter(pk__in=member_ids)
    except Exception:
        from django.http import Http404
        raise Http404("Group not found")

    context = {
        "active_page": "list-groups",
        "group": group,
        "members": members,
    }
    return _render(request, "admin_panel/group_detail.html", context)

@admin_required
def user_select(request):
    query = request.GET.get("q", "").strip()
    users = User.objects.all().order_by("username")
    if query:
        users = users.filter(username__icontains=query)
    context = {"users": users, "query": query}
    return _render(request, "admin_panel/user_select.html", context)

@admin_required
def activities(request):
    try:
        from activity.models import Activity
        activity_list = Activity.objects.all().order_by("-created_at")[:100]
    except Exception:
        activity_list = []

    context = {
        "active_page": "activities",
        "activities": activity_list,
    }

    return _render(request, "admin_panel/activities.html", context)
