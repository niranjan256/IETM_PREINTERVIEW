from django.core.management.base import BaseCommand
from django.db import connection

from content.models import ContentBlock
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

        self.stdout.write("  Loading block data into memory ...")
        block_data = [
            {
                "pk":               b.pk,
                "content_html":     b.content_html,
                "block_type":       b.block_type,
                "order":            b.order,
                "node_pk":          b.node.pk,
                "node_document_id": b.node.document_id,
                "node_xml_id":      b.node.xml_id,
                "node_number":      b.node.number,
                "node_title":       b.node.title,
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

            chroma_id      = f"block_{block['pk']}"
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
