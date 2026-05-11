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
                "node_pk":     s["node_pk"],
                "node_title":  s["node_title"],
                "node_number": s["node_number"],
                "xml_id":      s["xml_id"],
                "doc_pk":      s["doc_pk"],
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
