
from django.urls import path
from . import views

urlpatterns = [
    path('', views.topic_notes_list, name='topic_notes_list'),
    path('<str:topicId>/', views.topic_note_detail, name='topic_note_detail'),
]
