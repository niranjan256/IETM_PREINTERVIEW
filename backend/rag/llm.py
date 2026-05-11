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
    context_text = _build_context_text(context_sections)

    messages: List[Dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(chat_history[-6:])
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
