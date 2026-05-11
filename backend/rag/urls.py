from django.urls import path
from .api_views import RagChatView

urlpatterns = [
    path("chat/", RagChatView.as_view(), name="rag-chat"),
]
