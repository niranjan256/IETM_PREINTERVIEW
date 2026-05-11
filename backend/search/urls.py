
from django.urls import path
from . import views

urlpatterns = [
    path('', views.add_search, name='add_search'),
    path('<int:userId>', views.get_recent_searches, name='get_recent_searches'),
]
