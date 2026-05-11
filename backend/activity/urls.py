
from django.urls import path
from . import views

urlpatterns = [
    path('', views.add_activity, name='add_activity'),
    path('<int:userId>', views.get_activity, name='get_activity'),
]
