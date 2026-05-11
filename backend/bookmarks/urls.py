
from django.urls import path
from . import views

urlpatterns = [
    path('', views.bookmarks_list, name='bookmarks_list'),
    path('<int:id>/', views.delete_bookmark, name='delete_bookmark'),
]
