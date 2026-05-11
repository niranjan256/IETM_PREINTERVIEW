import json

from django.http import StreamingHttpResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .pipeline import rag_stream

def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"

@method_decorator(csrf_exempt, name="dispatch")
class RagChatView(View):

    def _authenticate(self, request):
        auth   = TokenAuthentication()
        result = auth.authenticate(request)
        if result is None:
            raise AuthenticationFailed("Authentication credentials were not provided.")
        return result[0]

    def post(self, request, *args, **kwargs):
        try:
            self._authenticate(request)
        except (AuthenticationFailed, Exception) as exc:
            return StreamingHttpResponse(
                iter([_sse({"type": "error", "message": str(exc)})]),
                content_type="text/event-stream",
                status=401,
            )

        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return StreamingHttpResponse(
                iter([_sse({"type": "error", "message": "Invalid JSON body."})]),
                content_type="text/event-stream",
                status=400,
            )

        query = (body.get("query") or "").strip()
        if not query:
            return StreamingHttpResponse(
                iter([_sse({"type": "error", "message": "'query' field is required."})]),
                content_type="text/event-stream",
                status=400,
            )

        doc_pk = body.get("doc_pk")
        if doc_pk is not None:
            try:
                doc_pk = int(doc_pk)
            except (ValueError, TypeError):
                doc_pk = None

        history = body.get("history", [])
        if not isinstance(history, list):
            history = []

        def event_stream():
            for event in rag_stream(query, history, doc_pk=doc_pk):
                yield _sse(event)

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"]     = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response
