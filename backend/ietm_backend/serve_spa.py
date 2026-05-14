
from pathlib import Path
from django.http import HttpResponse
from django.conf import settings

def serve_react(request):

    candidates = [
        Path(settings.STATIC_ROOT) / "frontend" / "index.html",
    ]

    # In standalone mode WHITENOISE_ROOT points directly to the frontend folder
    whitenoise_root = getattr(settings, "WHITENOISE_ROOT", None)
    if whitenoise_root:
        candidates.append(Path(whitenoise_root) / "index.html")

    for d in getattr(settings, "STATICFILES_DIRS", []):
        candidates.append(Path(d) / "frontend" / "index.html")

    for path in candidates:
        if path.exists():
            return HttpResponse(path.read_bytes(), content_type="text/html; charset=utf-8")

    return HttpResponse(
        b"<h2>Frontend not built.</h2>"
        b"<p>Run: <code>pnpm build</code> then copy <code>dist/</code> "
        b"to <code>django_backend/static/frontend/</code></p>",
        content_type="text/html",
        status=503,
    )
