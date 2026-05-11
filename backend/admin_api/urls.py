
from django.urls import path
from . import views

urlpatterns = [
    path('users', views.users_list, name='users_list'),
    path('users/<int:id>', views.user_detail, name='user_detail'),
    path('users/<int:id>/status', views.user_status, name='user_status'),
]
