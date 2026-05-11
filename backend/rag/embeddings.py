from functools import lru_cache
from typing import List

import httpx
from django.conf import settings

@lru_cache(maxsize=256)
def get_embedding(text: str) -> List[float]:
    url = f"{settings.OLLAMA_BASE_URL}/api/embeddings"
    payload = {
        "model": settings.OLLAMA_EMBED_MODEL,
        "prompt": text,
    }
    with httpx.Client(timeout=60.0) as client:
        response = client.post(url, json=payload)
        response.raise_for_status()
        return response.json()["embedding"]
