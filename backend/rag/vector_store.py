
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
