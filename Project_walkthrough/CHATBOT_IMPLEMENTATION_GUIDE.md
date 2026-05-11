# RAG Chatbot Implementation Guide

This file is a complete, self-contained specification for adding the RAG chatbot to a full-stack project that shares the same architecture as the IETM Level 4 system: Django REST backend + React 18 + Vite frontend. Copy this file into the target project and tell Claude: "Implement the chatbot using this file as source of plan/information."

---

## What this guide covers

A floating chat panel (bottom-right of the screen) that:
- Accepts natural-language questions from the user
- Retrieves the most relevant sections from the document database via vector similarity search
- Streams the LLM answer token-by-token (SSE)
- Displays clickable source citations that navigate to the cited content node
- Supports multi-turn conversation (remembers last 3 turns)
- Lets the user scope search to the current document or all documents

The system uses **Ollama** as a local LLM server (no external API costs, works offline). No external vector database — pure NumPy for similarity search.

---

## Assumptions about the target project

The target project is assumed to have:

**Backend (Django)**
- Django 4.x + Django REST Framework
- `TokenAuthentication` already configured (users get a token on login)
- A `ContentBlock` model with `content_html` (TextField), `block_type` (CharField), `order` (IntegerField), and a FK to `ContentNode`
- A `ContentNode` model with `pk`, `xml_id`, `number`, `title`, `document` (FK to `Document`)
- A `Document` model with `pk`
- `django-cors-headers` installed and `corsheaders.middleware.CorsMiddleware` first in `MIDDLEWARE`
- `httpx`, `beautifulsoup4`, `lxml`, `numpy` available (add to requirements.txt if missing)

**Frontend (React + Vite)**
- React 18, TypeScript, Tailwind CSS
- `react-markdown` and `remark-gfm` available (add to package.json if missing)
- `i18next` + `react-i18next` set up with a locale JSON file
- Auth token stored in `localStorage` under the key `"token"`
- A root component (e.g. `App.tsx`) that knows the current document PK and can navigate to a content node by its PK
- API calls go to `/api/...` (Vite proxy or same-origin Django)

If any assumption is wrong, adapt the relevant section accordingly.

---

## Part 1 — Backend

### 1.1 Install dependencies

Add to `requirements.txt` if not already present:
```
httpx==0.27.2
beautifulsoup4==4.12.3
lxml==5.3.0
numpy
```

### 1.2 Create the `rag` Django app

```bash
cd django_backend          # or wherever manage.py lives
python manage.py startapp rag
```

Add `"rag"` to `INSTALLED_APPS` in `settings.py`.

### 1.3 Django settings additions

Add these settings to `settings.py`. Use environment variables so values can differ between dev and Docker.

```python
import os

OLLAMA_BASE_URL   = os.environ.get("OLLAMA_BASE_URL",   "http://localhost:11434")
OLLAMA_EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
OLLAMA_CHAT_MODEL  = os.environ.get("OLLAMA_CHAT_MODEL",  "llama3.2")
CHROMA_PERSIST_DIR = os.environ.get("CHROMA_PERSIST_DIR", str(BASE_DIR / "chroma_db"))
RAG_TOP_K           = int(os.environ.get("RAG_TOP_K",            "4"))
RAG_MAX_CONTEXT_CHARS = int(os.environ.get("RAG_MAX_CONTEXT_CHARS", "4000"))
```

Also ensure SSE responses are not gzip-compressed by Django (they shouldn't be by default, but if you have `GZipMiddleware` in `MIDDLEWARE`, remove it or it will buffer the stream).

### 1.4 URL routing

In the project's main `urls.py`:
```python
path("api/rag/", include("rag.urls")),
```

### 1.5 File: `rag/urls.py`

```python
from django.urls import path
from .api_views import RagChatView

urlpatterns = [
    path("chat/", RagChatView.as_view(), name="rag-chat"),
]
```

### 1.6 File: `rag/html_utils.py`

Strips HTML from `content_html` before embedding. Table cells get pipe separators so tabular data stays readable as plain text.

```python
import re
from bs4 import BeautifulSoup


def html_to_text(html: str) -> str:
    if not html or not html.strip():
        return ""

    soup = BeautifulSoup(html, "lxml")

    for tag in soup.find_all(["td", "th"]):
        tag.insert_after(" | ")

    for tag in soup.find_all(["p", "li", "br", "tr", "h1", "h2", "h3", "h4", "h5", "h6"]):
        tag.insert_before("\n")

    text = soup.get_text(separator=" ")
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
```

### 1.7 File: `rag/embeddings.py`

LRU cache avoids redundant network calls for repeated queries.

```python
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
```

### 1.8 File: `rag/vector_store.py`

Pure NumPy vector store. No external DB dependency. Stores two files on disk under `CHROMA_PERSIST_DIR`:
- `ietm_vectors.npy` — float32 array of shape (N, 768)
- `ietm_meta.json` — list of metadata dicts

```python
"""
Pure-numpy vector store — no C++ compilation required.
Cosine similarity via brute-force dot product after L2 normalisation.
At typical IETM scale (hundreds–few thousand blocks, 768-dim vectors) this is
sub-millisecond per query and requires no extra dependencies.
"""

import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from django.conf import settings

_VECTORS_FILE = "ietm_vectors.npy"
_META_FILE    = "ietm_meta.json"

_cache: Optional[Tuple[np.ndarray, List[Dict]]] = None


def _dir() -> Path:
    p = Path(settings.CHROMA_PERSIST_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _load_from_disk() -> Tuple[Optional[np.ndarray], List[Dict]]:
    meta_path = _dir() / _META_FILE
    vec_path  = _dir() / _VECTORS_FILE

    if not meta_path.exists():
        return None, []

    with open(meta_path, encoding="utf-8") as f:
        entries: List[Dict] = json.load(f)

    if not vec_path.exists() or not entries:
        return None, entries

    vectors = np.load(str(vec_path))
    return vectors, entries


def _save_to_disk(entries: List[Dict], vectors: np.ndarray) -> None:
    np.save(str(_dir() / _VECTORS_FILE), vectors)
    with open(_dir() / _META_FILE, "w", encoding="utf-8") as f:
        json.dump(entries, f)


def _get_cache() -> Tuple[Optional[np.ndarray], List[Dict]]:
    global _cache
    if _cache is None:
        _cache = _load_from_disk()
    return _cache


def _normalise(v: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(v, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    return v / norms


def upsert_blocks(
    ids: List[str],
    embeddings: List[List[float]],
    documents: List[str],
    metadatas: List[Dict],
) -> None:
    """Insert or replace content block embeddings. Existing entries with matching
    chroma_id are replaced in-place."""
    global _cache

    existing_vectors, existing_entries = _get_cache()

    ids_set = set(ids)
    if existing_entries:
        keep_mask    = [e["chroma_id"] not in ids_set for e in existing_entries]
        kept_entries = [e for e, keep in zip(existing_entries, keep_mask) if keep]
        if existing_vectors is not None and len(existing_vectors):
            kept_vectors = existing_vectors[np.array(keep_mask, dtype=bool)]
        else:
            kept_vectors = None
    else:
        kept_entries = []
        kept_vectors = None

    new_vectors = _normalise(np.array(embeddings, dtype=np.float32))

    all_vectors = (
        np.vstack([kept_vectors, new_vectors])
        if kept_vectors is not None and len(kept_vectors)
        else new_vectors
    )

    new_entries = [
        {"chroma_id": cid, "document": doc, "metadata": meta}
        for cid, doc, meta in zip(ids, documents, metadatas)
    ]
    all_entries = kept_entries + new_entries

    _save_to_disk(all_entries, all_vectors)
    _cache = (all_vectors, all_entries)


def similarity_search(
    query_embedding: List[float],
    top_k: int,
    doc_pk: Optional[int] = None,
) -> Dict:
    """
    Return top_k most similar blocks to query_embedding.
    If doc_pk is given, restrict results to that document only.

    Returns a dict mirroring the ChromaDB query result schema:
        {ids, documents, metadatas, distances}
    where distances are cosine distances in [0, 2] (lower = more similar).
    """
    vectors, entries = _get_cache()

    empty = {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}
    if vectors is None or not entries:
        return empty

    q = np.array(query_embedding, dtype=np.float32)
    q_norm = np.linalg.norm(q)
    if q_norm > 0:
        q = q / q_norm

    scores: np.ndarray = vectors @ q
    order = np.argsort(-scores)

    result_ids, result_docs, result_metas, result_dists = [], [], [], []

    for idx in order:
        entry = entries[int(idx)]
        meta  = entry["metadata"]

        if doc_pk is not None and meta.get("doc_pk") != doc_pk:
            continue

        result_ids.append(entry["chroma_id"])
        result_docs.append(entry["document"])
        result_metas.append(meta)
        result_dists.append(float(1.0 - scores[idx]))

        if len(result_ids) >= top_k:
            break

    return {
        "ids":       [result_ids],
        "documents": [result_docs],
        "metadatas": [result_metas],
        "distances": [result_dists],
    }


def delete_blocks_for_document(doc_pk: int) -> None:
    """Remove all embeddings that belong to a given document."""
    global _cache

    vectors, entries = _get_cache()
    if not entries:
        return

    keep_mask    = np.array([e["metadata"].get("doc_pk") != doc_pk for e in entries], dtype=bool)
    kept_entries = [e for e, keep in zip(entries, keep_mask) if keep]

    if vectors is not None and len(vectors):
        kept_vectors = vectors[keep_mask]
    else:
        kept_vectors = np.zeros((0,), dtype=np.float32)

    if len(kept_entries) > 0 and kept_vectors.ndim == 2:
        _save_to_disk(kept_entries, kept_vectors)
        _cache = (kept_vectors, kept_entries)
    else:
        for fname in (_VECTORS_FILE, _META_FILE):
            fpath = _dir() / fname
            if fpath.exists():
                os.remove(str(fpath))
        _cache = (None, [])
```

### 1.9 File: `rag/llm.py`

Streams tokens from Ollama's chat endpoint. Temperature 0.1 keeps answers grounded. `num_ctx 2048` and `num_predict 600` balance context length vs. response length.

**IMPORTANT: Customise `SYSTEM_PROMPT`** for your project's domain. Replace "IETM for Indian defence equipment" with the appropriate domain description.

```python
import json
from typing import Dict, Iterator, List

import httpx
from django.conf import settings

SYSTEM_PROMPT = (
    "You are a technical assistant for an Interactive Electronic Technical Manual (IETM) "
    "for Indian defence equipment. "
    "Answer ONLY from the numbered context sections provided — never from general knowledge. "
    "If a question cannot be answered from the context, respond: "
    "'The manual does not contain information about this topic.' "
    "Do not invent part numbers, specifications, torque values, or procedures. "
    "Be direct and concise. Use bullet points for lists or steps. "
    "Cite section numbers like [Section 3.2.1] when referencing specific content."
)


def stream_chat(
    user_query: str,
    context_sections: List[Dict],
    chat_history: List[Dict],
) -> Iterator[str]:
    """
    Stream response tokens from Ollama chat API.

    context_sections: list of dicts with keys:
        text, node_title, node_number, xml_id, node_pk, doc_pk
    chat_history: list of {"role": "user"|"assistant", "content": str}

    Yields raw token strings one at a time.
    """
    context_text = _build_context_text(context_sections)

    messages: List[Dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(chat_history[-6:])  # keep last 3 conversation turns
    messages.append({
        "role": "user",
        "content": f"Context from technical manual:\n\n{context_text}\n\nQuestion: {user_query}",
    })

    payload = {
        "model": settings.OLLAMA_CHAT_MODEL,
        "messages": messages,
        "stream": True,
        "options": {
            "temperature": 0.1,
            "num_ctx": 2048,
            "num_predict": 600,
        },
    }

    url = f"{settings.OLLAMA_BASE_URL}/api/chat"
    with httpx.Client(timeout=None) as client:
        with client.stream("POST", url, json=payload) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if chunk.get("done"):
                    return
                token = chunk.get("message", {}).get("content", "")
                if token:
                    yield token


def _build_context_text(context_sections: List[Dict]) -> str:
    parts = []
    for i, sec in enumerate(context_sections, 1):
        header = f"[{i}] Section {sec['node_number']}: {sec['node_title']}"
        parts.append(f"{header}\n{sec['text']}")
    return "\n\n---\n\n".join(parts)
```

### 1.10 File: `rag/pipeline.py`

Orchestrates the full RAG pipeline: embed → retrieve → filter → emit sources → stream LLM tokens.

The distance threshold `_DISTANCE_THRESHOLD = 0.45` means cosine similarity ≥ 0.55. Increase this value to be more lenient (more results); decrease to be stricter (fewer but more relevant results).

```python
from typing import Dict, Iterator, List, Optional

from django.conf import settings

from .embeddings import get_embedding
from .llm import stream_chat
from .vector_store import similarity_search

_DISTANCE_THRESHOLD = 0.45


def rag_stream(
    user_query: str,
    chat_history: List[Dict],
    doc_pk: Optional[int] = None,
) -> Iterator[Dict]:
    """
    Full RAG pipeline. Yields dicts that api_views.py formats as SSE events.

    Yielded event types:
        {"type": "sources", "sources": [...]}
        {"type": "token",   "content": "..."}
        {"type": "done"}
        {"type": "error",   "message": "..."}
    """
    try:
        query_embedding = get_embedding(user_query)

        chroma_results = similarity_search(
            query_embedding=query_embedding,
            top_k=settings.RAG_TOP_K,
            doc_pk=doc_pk,
        )

        context_sections = _assemble_context(chroma_results)

        sources = [
            {
                "node_pk":    s["node_pk"],
                "node_title": s["node_title"],
                "node_number": s["node_number"],
                "xml_id":     s["xml_id"],
                "doc_pk":     s["doc_pk"],
            }
            for s in context_sections
        ]
        yield {"type": "sources", "sources": sources}

        for token in stream_chat(user_query, context_sections, chat_history):
            yield {"type": "token", "content": token}

        yield {"type": "done"}

    except Exception as exc:
        yield {"type": "error", "message": str(exc)}


def _assemble_context(chroma_results: Dict) -> List[Dict]:
    if not chroma_results.get("ids") or not chroma_results["ids"][0]:
        return []

    chars_per_chunk = settings.RAG_MAX_CONTEXT_CHARS // max(settings.RAG_TOP_K, 1)
    sections = []
    seen_ids      = set()
    seen_node_pks = set()

    for i, chroma_id in enumerate(chroma_results["ids"][0]):
        if chroma_id in seen_ids:
            continue
        seen_ids.add(chroma_id)

        distance = chroma_results["distances"][0][i]
        if distance > _DISTANCE_THRESHOLD:
            continue

        meta     = chroma_results["metadatas"][0][i]
        node_pk  = meta["node_pk"]
        if node_pk in seen_node_pks:
            continue
        seen_node_pks.add(node_pk)

        text = chroma_results["documents"][0][i] or ""

        sections.append({
            "text":        text[:chars_per_chunk],
            "node_pk":     meta["node_pk"],
            "node_title":  meta["node_title"],
            "node_number": meta["node_number"],
            "xml_id":      meta["xml_id"],
            "doc_pk":      meta["doc_pk"],
            "block_pk":    meta["block_pk"],
            "distance":    distance,
        })

    sections.sort(key=lambda s: s["node_number"])
    return sections
```

### 1.11 File: `rag/api_views.py`

SSE HTTP endpoint. Uses `StreamingHttpResponse` so tokens flow to the browser in real time. Authentication is required — unauthenticated requests get a 401 SSE error event.

```python
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
    """
    POST /api/rag/chat/

    Request body (JSON):
    {
        "query":   "How do I replace the fuel filter?",
        "doc_pk":  42,           // optional; omit for all-docs search
        "history": [...]         // optional; prior conversation turns
    }

    Response: text/event-stream (SSE)
        data: {"type": "sources", "sources": [{node_pk, node_title, node_number, xml_id, doc_pk}]}
        data: {"type": "token",   "content": "<token>"}
        data: {"type": "done"}
        data: {"type": "error",   "message": "<message>"}
    """

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
        response["Cache-Control"]    = "no-cache"
        response["X-Accel-Buffering"] = "no"   # prevents nginx buffering in LAN mode
        return response
```

### 1.12 File: `rag/management/__init__.py` and `rag/management/commands/__init__.py`

Create these as empty files to make the management command discoverable:
```
rag/management/__init__.py          (empty)
rag/management/commands/__init__.py (empty)
```

### 1.13 File: `rag/management/commands/generate_embeddings.py`

Run this after importing content. It reads all `ContentBlock` rows, converts HTML to plain text, calls Ollama for embeddings, and stores them in the NumPy vector store.

**IMPORTANT**: The model name referenced in the imports (`ContentBlock`, `ContentNode`, `Document`) must match your actual app and model names. If your app is named differently (e.g. `documents` instead of `content`), update the import at the top.

```python
from django.core.management.base import BaseCommand
from django.db import connection

from content.models import ContentBlock   # <-- update app name if different
from rag.embeddings import get_embedding
from rag.html_utils import html_to_text
from rag.vector_store import delete_blocks_for_document, upsert_blocks

BATCH_SIZE         = 50
DEFAULT_SKIP_TYPES = {"FIGURE", "MODEL3D", "VIDEO", "PDF"}


class Command(BaseCommand):
    help = "Generate and store RAG embeddings for content blocks."

    def add_arguments(self, parser):
        parser.add_argument("--doc-pk",     type=int, default=None)
        parser.add_argument("--reset",      action="store_true")
        parser.add_argument("--skip-types", nargs="+", default=list(DEFAULT_SKIP_TYPES))

    def handle(self, *args, **options):
        doc_pk     = options["doc_pk"]
        reset      = options["reset"]
        skip_types = set(options["skip_types"])

        if reset:
            if doc_pk is None:
                self.stderr.write("--reset requires --doc-pk. To reset all, delete chroma_db/ manually.")
                return
            self.stdout.write(f"Deleting existing embeddings for doc_pk={doc_pk} ...")
            delete_blocks_for_document(doc_pk)

        qs = (
            ContentBlock.objects
            .select_related("node", "node__document")
            .order_by("pk")
            .exclude(block_type__in=skip_types)
        )
        if doc_pk is not None:
            qs = qs.filter(node__document_id=doc_pk)

        total = qs.count()
        self.stdout.write(f"Embedding {total} content blocks (batch size {BATCH_SIZE}) ...")

        # Load all data into memory before releasing the DB connection,
        # so slow Ollama API calls don't hold a SQLite read lock.
        self.stdout.write("  Loading block data into memory ...")
        block_data = [
            {
                "pk":              b.pk,
                "content_html":    b.content_html,
                "block_type":      b.block_type,
                "order":           b.order,
                "node_pk":         b.node.pk,
                "node_document_id": b.node.document_id,
                "node_xml_id":     b.node.xml_id,
                "node_number":     b.node.number,
                "node_title":      b.node.title,
            }
            for b in qs.iterator(chunk_size=500)
        ]
        connection.close()

        batch_ids, batch_embeddings, batch_documents, batch_metadatas = [], [], [], []
        processed = skipped = errors = 0

        for block in block_data:
            plain_text = html_to_text(block["content_html"])
            if len(plain_text.strip()) < 20:
                skipped += 1
                continue

            chroma_id    = f"block_{block['pk']}"
            text_for_embed = plain_text[:2000]

            try:
                embedding = get_embedding(text_for_embed)
            except Exception as exc:
                self.stderr.write(f"  ERROR block {block['pk']}: {exc}")
                errors += 1
                continue

            batch_ids.append(chroma_id)
            batch_embeddings.append(embedding)
            batch_documents.append(text_for_embed)
            batch_metadatas.append({
                "block_pk":    block["pk"],
                "node_pk":     block["node_pk"],
                "doc_pk":      block["node_document_id"],
                "xml_id":      block["node_xml_id"],
                "node_number": block["node_number"],
                "node_title":  block["node_title"],
                "block_type":  block["block_type"],
                "order":       block["order"],
            })
            processed += 1

            if len(batch_ids) >= BATCH_SIZE:
                upsert_blocks(batch_ids, batch_embeddings, batch_documents, batch_metadatas)
                self.stdout.write(f"  Upserted {processed}/{total} ...")
                batch_ids, batch_embeddings, batch_documents, batch_metadatas = [], [], [], []

        if batch_ids:
            upsert_blocks(batch_ids, batch_embeddings, batch_documents, batch_metadatas)

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Embedded: {processed}, Skipped (too short): {skipped}, Errors: {errors}"
            )
        )
```

### 1.14 File: `rag/__init__.py`

Empty file — just makes `rag` a Python package.

---

## Part 2 — Frontend

### 2.1 Install npm packages

```bash
pnpm add react-markdown remark-gfm
# (if i18next is not already installed)
pnpm add i18next react-i18next
```

### 2.2 File: `src/services/chatService.ts`

Copy this file verbatim. The only thing you might need to change is `API_BASE` if your API lives at a different prefix than `/api`.

```typescript
const API_BASE = "/api";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SourceCitation {
  node_pk: number;
  node_title: string;
  node_number: string;
  xml_id: string;
  doc_pk: number;
}

export interface StreamCallbacks {
  onSources: (sources: SourceCitation[]) => void;
  onToken:   (token: string) => void;
  onDone:    () => void;
  onError:   (message: string) => void;
}

/**
 * Stream a RAG chat response from the backend SSE endpoint.
 *
 * Uses fetch + ReadableStream instead of EventSource because EventSource
 * is GET-only and cannot send POST bodies or custom Authorization headers.
 *
 * Returns an AbortController so the caller can cancel mid-stream.
 */
export function streamChat(
  query: string,
  history: ChatMessage[],
  callbacks: StreamCallbacks,
  docPk?: number | null,
): AbortController {
  const controller = new AbortController();
  const token = localStorage.getItem("token");

  const body: Record<string, unknown> = { query, history };
  if (docPk != null) {
    body.doc_pk = docPk;
  }

  fetch(`${API_BASE}/rag/chat/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok || !response.body) {
        callbacks.onError(`HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by double newlines
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const trimmed = frame.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed.slice(6);
          try {
            const event = JSON.parse(jsonStr) as {
              type: string;
              sources?: SourceCitation[];
              content?: string;
              message?: string;
            };

            switch (event.type) {
              case "sources":
                callbacks.onSources(event.sources ?? []);
                break;
              case "token":
                callbacks.onToken(event.content ?? "");
                break;
              case "done":
                callbacks.onDone();
                break;
              case "error":
                callbacks.onError(event.message ?? "Unknown error");
                break;
            }
          } catch {
            // Malformed JSON frame — skip silently
          }
        }
      }
    })
    .catch((err: Error) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message ?? "Network error");
      }
    });

  return controller;
}
```

### 2.3 File: `src/app/components/ChatPanel.tsx`

Copy this file verbatim. It has no hard-coded strings — all user-visible text goes through `t()` i18n keys. See Section 2.5 for the required keys.

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";

import {
  type ChatMessage,
  type SourceCitation,
  streamChat,
} from "../../services/chatService";

interface ChatPanelProps {
  currentDocPk: number | null;
  currentDocTitle?: string;
  onNavigateToNode?: (nodePk: number) => void;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
  isStreaming?: boolean;
}

export function ChatPanel({
  currentDocPk,
  currentDocTitle,
  onNavigateToNode,
}: ChatPanelProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen]           = useState(false);
  const [scopeAllDocs, setScopeAllDocs] = useState(false);
  const [inputValue, setInputValue]   = useState("");
  const [messages, setMessages]       = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading]     = useState(false);
  const [history, setHistory]         = useState<ChatMessage[]>([]);

  const messagesEndRef            = useRef<HTMLDivElement>(null);
  const abortControllerRef        = useRef<AbortController | null>(null);
  const latestAssistantContentRef = useRef<string>("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isOpen) {
      abortControllerRef.current?.abort();
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    const query = inputValue.trim();
    if (!query || isLoading) return;

    const userMsgId      = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;
    latestAssistantContentRef.current = "";

    setMessages((prev) => [
      ...prev,
      { id: userMsgId,      role: "user",      content: query },
      { id: assistantMsgId, role: "assistant",  content: "", isStreaming: true },
    ]);
    setInputValue("");
    setIsLoading(true);

    const docPk = scopeAllDocs ? null : currentDocPk;

    abortControllerRef.current = streamChat(
      query,
      history,
      {
        onSources: (sources) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, sources } : m)),
          );
        },
        onToken: (token) => {
          latestAssistantContentRef.current += token;
          const captured = latestAssistantContentRef.current;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: captured } : m,
            ),
          );
        },
        onDone: () => {
          setIsLoading(false);
          const finalContent = latestAssistantContentRef.current;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: finalContent, isStreaming: false }
                : m,
            ),
          );
          setHistory((prev) => [
            ...prev,
            { role: "user",      content: query },
            { role: "assistant", content: finalContent },
          ]);
        },
        onError: (message) => {
          setIsLoading(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: `Error: ${message}`, isStreaming: false }
                : m,
            ),
          );
        },
      },
      docPk,
    );
  }, [inputValue, isLoading, scopeAllDocs, currentDocPk, history]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setHistory([]);
    setIsLoading(false);
    latestAssistantContentRef.current = "";
  };

  const scopeLabel = scopeAllDocs
    ? t("chat.searching_all")
    : currentDocTitle
      ? currentDocTitle.slice(0, 28) + (currentDocTitle.length > 28 ? "…" : "")
      : t("chat.no_doc");

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600
                   hover:bg-blue-700 active:bg-blue-800 text-white shadow-xl
                   flex items-center justify-center transition-colors duration-150"
        title="Open AI Assistant"
        aria-label="Open AI chat assistant"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
        </svg>
      </button>

      {/* Slide-up panel */}
      <div
        className={[
          "fixed bottom-0 right-6 z-40 w-96 bg-white rounded-t-xl shadow-2xl",
          "border border-gray-200 flex flex-col",
          "transition-all duration-300 ease-in-out",
          isOpen ? "h-[600px] opacity-100" : "h-0 opacity-0 pointer-events-none",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-blue-600 rounded-t-xl flex-shrink-0">
          <div className="flex flex-col min-w-0">
            <span className="text-white font-semibold text-sm">{t("chat.title")}</span>
            <span className="text-blue-200 text-xs truncate">{scopeLabel}</span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={handleClear}
              className="text-blue-200 hover:text-white text-xs underline"
            >
              {t("chat.clear")}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-blue-200"
              aria-label="Close chat"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scope toggle */}
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <span className="text-xs text-gray-500 font-medium">Search:</span>
          <button
            onClick={() => setScopeAllDocs(false)}
            className={[
              "text-xs px-2 py-1 rounded transition-colors",
              !scopeAllDocs
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300",
            ].join(" ")}
          >
            {t("chat.scope_current")}
          </button>
          <button
            onClick={() => setScopeAllDocs(true)}
            className={[
              "text-xs px-2 py-1 rounded transition-colors",
              scopeAllDocs
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300",
            ].join(" ")}
          >
            {t("chat.scope_all")}
          </button>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {messages.length === 0 && (
            <p className="text-center text-gray-400 text-sm mt-10">
              {t("chat.empty")}
            </p>
          )}
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onNavigateToNode={onNavigateToNode}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-4 py-3 border-t border-gray-200 flex-shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.placeholder")}
              className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2
                         text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                         focus:border-transparent min-h-[40px] max-h-[100px]"
              rows={2}
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim()}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                         flex items-center justify-center flex-shrink-0 self-end"
              aria-label="Send message"
            >
              {isLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: DisplayMessage;
  onNavigateToNode?: (nodePk: number) => void;
}

function MessageBubble({ message, onNavigateToNode }: MessageBubbleProps) {
  const { t } = useTranslation();
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%]">
        <div
          className={[
            "rounded-lg px-3 py-2 text-sm break-words",
            isUser
              ? "bg-blue-600 text-white rounded-br-none"
              : "bg-gray-100 text-gray-800 rounded-bl-none",
          ].join(" ")}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p:          ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                strong:     ({ children }) => <strong className="font-semibold">{children}</strong>,
                em:         ({ children }) => <em className="italic">{children}</em>,
                ul:         ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
                ol:         ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
                li:         ({ children }) => <li>{children}</li>,
                code:       ({ children }) => (
                  <code className="bg-gray-200 text-gray-900 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
                ),
                pre:        ({ children }) => (
                  <pre className="bg-gray-200 text-gray-900 rounded p-2 text-xs font-mono overflow-x-auto mb-1">{children}</pre>
                ),
                table:      ({ children }) => (
                  <div className="overflow-x-auto my-1">
                    <table className="text-xs border-collapse w-full">{children}</table>
                  </div>
                ),
                thead:      ({ children }) => <thead className="bg-gray-300">{children}</thead>,
                th:         ({ children }) => (
                  <th className="border border-gray-400 px-2 py-1 font-semibold text-left">{children}</th>
                ),
                td:         ({ children }) => (
                  <td className="border border-gray-300 px-2 py-1">{children}</td>
                ),
                tr:         ({ children }) => <tr className="even:bg-gray-200">{children}</tr>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-gray-400 pl-2 italic text-gray-600 mb-1">{children}</blockquote>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-current opacity-70 ml-0.5 animate-pulse align-text-bottom" />
          )}
        </div>

        {/* Source citations */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-1.5 space-y-1">
            <span className="text-xs text-gray-400 font-medium">{t("chat.sources")}</span>
            {message.sources.map((src) => (
              <button
                key={`${src.node_pk}-${src.xml_id}`}
                onClick={() => onNavigateToNode?.(src.node_pk)}
                className="block w-full text-left text-xs text-blue-600 hover:text-blue-800
                           hover:underline bg-blue-50 hover:bg-blue-100 rounded px-2 py-1
                           truncate transition-colors"
                title={`Section ${src.node_number}: ${src.node_title}`}
              >
                <span className="font-medium">{src.node_number}</span>
                {" — "}
                {src.node_title.length > 45
                  ? src.node_title.slice(0, 45) + "…"
                  : src.node_title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

### 2.4 Wiring `ChatPanel` into the root component

In your root component (e.g. `App.tsx`), import and render `ChatPanel`. Pass:
- `currentDocPk` — the PK of the document the user is currently viewing (or `null`)
- `currentDocTitle` — the title string of that document (optional, shown in the panel header)
- `onNavigateToNode` — a function `(nodePk: number) => void` that navigates the app to show that content node

Example:
```tsx
import { ChatPanel } from "./components/ChatPanel";

// Inside your JSX return:
<ChatPanel
  currentDocPk={currentTopic?.doc_pk ?? null}
  currentDocTitle={currentTopic?.title}
  onNavigateToNode={loadTopic}   // replace with your actual navigation function
/>
```

The `ChatPanel` positions itself as `fixed bottom-6 right-6`, so it floats above all other content regardless of where you put the JSX in the tree.

### 2.5 i18n strings

Add the `chat` key block to your locale JSON files. Example for English (`en.json`):
```json
{
  "chat": {
    "title": "AI Assistant",
    "scope_current": "Current Doc",
    "scope_all": "All Documents",
    "placeholder": "Ask a question… (Enter to send)",
    "clear": "Clear",
    "sources": "Sources:",
    "empty": "Ask a question about the document.",
    "searching_all": "All documents",
    "no_doc": "No document open"
  }
}
```

Repeat for any other locale files your project uses, translating the values.

If your project does **not** use i18n at all, replace every `t("chat.xxx")` call in `ChatPanel.tsx` with a hardcoded string literal and remove the `useTranslation()` import.

---

## Part 3 — Ollama setup

Ollama must be running and the required models pulled before the chatbot works.

```bash
# Install Ollama: https://ollama.com/download
# Then pull models:
ollama pull nomic-embed-text   # embedding model (768-dim, ~274 MB)
ollama pull llama3.2           # chat model (~2 GB, smallest that works well)

# Verify:
ollama list
```

Ollama listens on `http://localhost:11434` by default. In Docker, set `OLLAMA_BASE_URL=http://ietm-ollama:11434` (or whatever the service name is).

---

## Part 4 — First-time setup & data flow

### Step 1: Start services
```bash
# Terminal 1 — Django
cd <backend_dir>
python manage.py runserver

# Terminal 2 — Frontend
cd <frontend_dir>
pnpm dev

# Ollama (system service or separate terminal)
ollama serve
```

### Step 2: Import content
Import your documents however your project does it (management command, admin upload, etc.). The `ContentBlock` rows must exist before you can generate embeddings.

### Step 3: Generate embeddings
```bash
cd <backend_dir>
python manage.py generate_embeddings
# For a single document:
python manage.py generate_embeddings --doc-pk 1
# Wipe and re-embed a single document:
python manage.py generate_embeddings --doc-pk 1 --reset
```

This creates `chroma_db/ietm_vectors.npy` and `chroma_db/ietm_meta.json` under the Django `BASE_DIR`. Re-run whenever you import new or updated content.

### Step 4: Test the chat
Open the frontend, log in, open a document, click the blue chat button (bottom-right), and ask a question.

---

## Part 5 — Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Chat button gets a 401 error | Auth token missing or expired | Re-login; check localStorage has `token` key |
| Sources returned but answer is "manual does not contain…" | Retrieved blocks are below distance threshold | Lower `_DISTANCE_THRESHOLD` in `pipeline.py` (try 0.6), or check `generate_embeddings` ran |
| No sources returned | Embeddings not generated, or Ollama not running | Run `generate_embeddings`; check `ollama serve` |
| Streaming never starts / request hangs | Ollama not running, model not pulled | `ollama list`; `ollama pull llama3.2` |
| Panel shows "Error: …" immediately | Backend error (check Django logs) | Check Django console for traceback |
| Text appears all at once instead of streaming | Nginx buffering the SSE response | Ensure `X-Accel-Buffering: no` header is set (it is in `api_views.py`); also check `proxy_buffering off` in nginx config |
| `generate_embeddings` silently skips all blocks | `ContentBlock.content_html` is empty or blocks have types in `DEFAULT_SKIP_TYPES` | Pass `--skip-types NONE` or check your block data |

---

## Part 6 — Key design decisions (for future changes)

**Why `fetch` instead of `EventSource` for SSE?**
`EventSource` is GET-only and cannot send a JSON request body or an `Authorization` header. `fetch` + `ReadableStream` with manual SSE frame parsing gives identical behaviour with full control over the request.

**Why NumPy instead of ChromaDB?**
No C++ compilation step, no external process, works on any platform. At the scale of a single IETM document (hundreds to low-thousands of text blocks, 768-dim vectors) it is sub-millisecond per query. If the document corpus grows to tens of thousands of blocks, consider switching to ChromaDB or pgvector.

**Why Ollama instead of OpenAI?**
Offline operation, no API costs, no data leaves the machine. The system prompt, temperature, and context window settings are calibrated for Llama 3.2. If you switch to a different model via `OLLAMA_CHAT_MODEL`, you may need to re-tune `num_ctx` and `num_predict` in `llm.py`.

**Why is chat history client-side only?**
Persistence would require a `ChatSession` and `ChatMessage` model, auth-scoped queries, and a history retrieval endpoint. For a technical manual viewer this complexity is not worth it — users care about the current session's context, not yesterday's questions.

**Why is the distance threshold 0.45?**
Cosine distance 0.45 means cosine similarity 0.55 — only results that are "more than half similar" to the query are shown. This prevents obviously irrelevant sections from polluting the LLM context and producing hallucinated answers. You can experiment with this value in `pipeline.py`.
