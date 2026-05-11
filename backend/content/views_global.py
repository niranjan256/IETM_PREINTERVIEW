
from __future__ import annotations

import csv
from pathlib import Path
from typing import Optional

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated

GLOBAL_DIR = "_global"

def _find_asset(prefix: str) -> Optional[Path]:
    root = Path(settings.MEDIA_ROOT) / GLOBAL_DIR
    if not root.is_dir():
        return None
    for p in root.iterdir():
        if p.is_file() and p.stem == prefix:
            return p
    return None

@api_view(["GET"])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def prepages(request):
    asset = _find_asset("prepages")
    if asset is None:
        return JsonResponse({"detail": "Prepages not available"}, status=404)
    url = f"{settings.MEDIA_URL.rstrip('/')}/{GLOBAL_DIR}/{asset.name}"
    return JsonResponse({"url": url, "title": "Prepages", "filename": asset.name})

@api_view(["GET"])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def abbreviations(request):
    asset = _find_asset("abbreviations")
    if asset is None:
        return JsonResponse({"detail": "Abbreviations not available"}, status=404)

    rows = []

    with open(asset, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            if len(row) < 2:
                continue
            abbr = row[0].strip()
            full = row[1].strip()
            if not abbr and not full:
                continue
            rows.append({"abbr": abbr, "full": full})

    return JsonResponse({"title": "Abbreviations", "rows": rows})
