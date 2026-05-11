
from django.urls import path
from . import views

urlpatterns = [
    path('', views.groups_list, name='groups_list'),
    path('<int:id>', views.group_detail, name='group_detail'),
    path('<int:id>/assign', views.assign_users, name='assign_users'),
]
