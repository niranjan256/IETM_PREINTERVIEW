
from django.urls import path, re_path
from . import views

urlpatterns = [
    path('', views.save_note, name='save_note'),

    path('<int:userId>', views.note_detail, name='note_detail'),

    re_path(r'^(?P<topicId>[a-zA-Z0-9_-]+)$', views.delete_note_by_topic, name='delete_note_by_topic'),
]
