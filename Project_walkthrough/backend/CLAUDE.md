# Django Backend — Claude Guide

Parent overview: [`../CLAUDE.md`](../CLAUDE.md)

---

## Project isolation (port 8001)

This project runs on **port 8001** to avoid conflicts with other IETM versions. Docker and standalone executable files have been removed — this is a pure dev setup.

**Removed (not needed here):**
- `launcher.py` — IETM.exe entry point (standalone executable)
- `.dockerignore`, `entrypoint.sh`, `Dockerfile` — Docker artifacts
- `dist/` — deployment bundles

**Active:**
- Dev server: `python manage.py runserver 8001`
- Database: `db.sqlite3` (SQLite)
- Frontend proxy: Vite proxies `/api` and `/media` to `http://localhost:8001`

---

## Dev server

```bash
cd django_backend
venv\Scripts\activate          # Windows  |  source venv/bin/activate (Linux/Mac)
python manage.py runserver 8001  # http://localhost:8001
```

---

## Apps

| App | Purpose |
|-----|---------|
| `content/` | Core content tree (`Document`, `ContentNode`), import management command, search, admin |
| `auth_api/` | Token auth, custom auth backends, permissions |
| `admin_api/` | Admin-only REST endpoints |
| `bookmarks/` | User bookmarks |
| `notes/` | User notes |
| `topic_notes/` | Per-topic notes |
| `search/` | Full-text search |
| `groups_api/` | Access group + department management |
| `activity/` | User activity tracking |

---

## Core models (`content/models.py`)

### `Document`
Top-level IETM document. Fields: `doc_id` (unique), `title`, `doc_type`, `classification`, `generated_date`, `generator_version`, `imported_at`.

### `ContentNode`
Hierarchical node. Node types: `section`, `leaf_group`, `leaf`. Key fields:

| Field | Type | Notes |
|-------|------|-------|
| `document` | FK → Document | Cascade delete |
| `node_type` | CharField | `section` / `leaf_group` / `leaf` |
| `xml_id` | CharField | Original XML ID e.g. `CALM_DS_sec_1_2_3` |
| `number` | CharField | Dotted number e.g. `1.2.3` |
| `title` | CharField | Display title |
| `level` | IntegerField | Heading level 1–6 |
| `parent` | FK → self | Tree hierarchy |
| `path` | CharField | Materialized path e.g. `1.2.3` (indexed, fast traversal) |
| `order` | IntegerField | Sort order among siblings |
| `leaf_group_root` | FK → self | For leaf_group: points to its root section |

Pending TODO: `access_groups` M2M and `security_class` CharField (not yet in schema).

---

## API endpoint index

All endpoints require token auth unless noted. Base: `http://localhost:8001`

### Content
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/content/documents/` | GET | List all documents |
| `/api/content/documents/<pk>/` | GET | Document detail + node tree |
| `/api/content/nodes/<pk>/` | GET | Single node + its content blocks (topic view) |
| `/api/content/search/` | GET `?q=` | Full-text search across nodes |
| `/api/content/prepages/` | GET | Global prepages PDF `{url, title, filename}` or 404 |
| `/api/content/abbreviations/` | GET | Global abbreviations `{title, rows: [{abbr, full}]}` |

### `/api/content/nodes/<pk>/` response shape

```jsonc
{
  "id": 42,
  "title": "...",
  "number": "1.2.3",
  "blocks": [
    {
      "blockType": "paragraph|heading|figure|table|model3d|video|pdf|leaf_group_child",
      "contentHtml": "<p>...</p>",
      "blockId": 1234,       // ContentBlock.pk (Phase 1+)
      "xmlId": "sec_xyz",    // for xref/hotspot matching (Phase 1+)
      "media": null          // or MediaItem shape for figure/model3d/video/pdf (Phase 1+)
    }
  ],
  "mediaItems": [...],       // legacy separate list — kept until Phase 3 cleanup
  "prevNode": { "id": ..., "title": ... },
  "nextNode": { "id": ..., "title": ... }
}
```

**LEAF node behaviour**: if the requested `pk` is a `LEAF`-type node, the API transparently redirects to its parent `LEAF_GROUP` and returns the full group content. Hotspot navigation that resolves to a LEAF still shows the correct page and enables prev/next buttons.

### Auth
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login/` | POST | `{username, password}` → `{token}` |
| `/api/auth/logout/` | POST | Invalidate token |
| `/api/auth/user/` | GET | Current user info |

### User data
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bookmarks/` | GET/POST/DELETE | User bookmarks |
| `/api/notes/` | GET/POST/PUT/DELETE | User notes |
| `/api/topic-notes/` | GET/POST/PUT/DELETE | Per-topic notes |
| `/api/activity/` | GET/POST | User activity log |
| `/api/groups/` | GET/POST | Access groups |
| `/api/departments` | GET/POST | Departments |
| `/api/admin/` | GET | Admin-only stats/management |

### Legacy / utility
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (no auth) |
| `/api/image-hotspots/<imageName>` | GET | Hotspots for a named image |
| `/api/model-hotspots/<modelName>` | GET | Hotspots for a named 3D model |

---

## Management commands

```bash
cd django_backend && venv\Scripts\activate

# Import from master.xml (full IETM root with global assets)
python manage.py import_xml --source <path>/master.xml --clear

# Import a single document XML
python manage.py import_xml --source <path>/ietm_output.xml --single --clear
```

---

## Settings notes (`ietm_backend/settings.py`)

| Setting | Value | Why |
|---------|-------|-----|
| `IETM_MODE` | `standalone` / `network` | Switches DB (SQLite vs PostgreSQL) |
| `X_FRAME_OPTIONS` | `SAMEORIGIN` | Overrides Django default `DENY` — needed for PDF `<iframe>` on same origin |
| `SERVE_SPA` | env var `0`/`1` | `1` = Django serves the React SPA (standalone prod); `0` = Vite dev server |

---

## Global asset files

Served from `MEDIA_ROOT/_global/`. Registered in `master.xml` by the pipeline.
Imported automatically by `import_xml` management command.

- `_global/prepages.pdf` → exposed at `/api/content/prepages/`
- `_global/abbreviations.csv` (columns: `Abbreviation,Full Form`) → `/api/content/abbreviations/`

Implemented in `content/views_global.py`.

---

## Adding a new model field (migration workflow)

```bash
# 1. Edit content/models.py — add the field
# 2. Generate migration
python manage.py makemigrations content
# 3. Apply
python manage.py migrate
# 4. Update import_xml.py to parse the new XML attribute if needed
# 5. Update serializers/views if the field should appear in the API
```

---

## `import_xml.py` notes

### List rendering (`_render_list_item`)
Strips the list label prefix from item text using the `label` XML attribute for targeted matching. Pattern priority: `(a)` → `a)` → `a.` → `a `. Prevents double-prefixes like `(a) (a) text`.

### Table rendering (`_render_table_row`)
- `table-layout: auto` — column widths determined by content, not equal split.
- Cells spanning all columns (colspan == col_count) get class `spanning-header` — rendered centered and bold.
- Uses CALS `namest`/`nameend` attributes to compute colspan.

### Table caption
`.table-caption` in `content.css`: padded (`6px 10px`), displayed as block, italic. Caption is shown above the table wrapper.

---

## Known content rendering behaviours

| Behaviour | Where | Detail |
|-----------|-------|--------|
| Ordered list false-positive suppression | `import_xml._render_list_item` + `tree_builder._consolidate_block_list` | Single-item non-bullet list detected in pipeline → emitted as paragraph (label prepended). Authoring rule: every OL/UL must have ≥ 2 items starting with `(a)` or Word numbered style. |
| LEAF → LEAF_GROUP redirect | `api_views.content_topic` | If `node.node_type == LEAF`, silently redirect to parent before building response. Ensures hotspot nav and direct URL both show full section. |
| Spanning header rows | `import_xml._render_table_row` | Rows where a single cell spans all columns get `spanning-header` CSS class for centred bold styling. |
