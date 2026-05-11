# Project Source File TOC
**IETM Level 4 System** — Custom-authored source files only.
Excludes: `node_modules/`, `venv/`, `__pycache__/`, `migrations/`, `dist/`, `build/`, `chroma_db/`, `media/`, shadcn `ui/` library components, and framework-generated boilerplate.

---

## backend/

```
backend/
├── manage.py
│
├── ietm_backend/               ← Django project config
│   ├── settings.py
│   ├── urls.py                 (root URL dispatcher)
│   ├── views.py
│   ├── serve_spa.py            (serves React SPA in standalone mode)
│   ├── asgi.py
│   └── wsgi.py
│
├── activity/                   ← User activity logging
│   ├── models.py
│   ├── views.py
│   ├── urls.py
│   └── apps.py
│
├── admin_api/                  ← Admin REST endpoints (user CRUD)
│   ├── views.py
│   ├── urls.py
│   └── apps.py
│
├── auth_api/                   ← Authentication & authorisation
│   ├── models.py               (custom User model with bcrypt)
│   ├── views.py                (login / register / logout)
│   ├── backends.py             (bcrypt auth backend)
│   ├── authentication.py       (CSRF-exempt session auth)
│   ├── permissions.py          (IsAdminRole DRF permission)
│   ├── auth_helpers.py
│   ├── utils.py                (password hash/verify helpers)
│   └── urls.py
│
├── bookmarks/                  ← User content bookmarks
│   ├── models.py
│   ├── views.py
│   └── urls.py
│
├── content/                    ← Core IETM content (main app)
│   ├── models.py               (Document, ContentNode, ContentBlock, Media, Hotspot, …)
│   ├── views.py                (session-based HTML views)
│   ├── api_views.py            (DRF REST: toc, topic, search, prepages, …)
│   ├── admin_views.py          (admin dashboard views)
│   ├── views_global.py         (global asset endpoints)
│   ├── urls.py
│   ├── api_urls.py
│   ├── admin_urls.py
│   ├── admin.py                (Django admin registrations)
│   ├── tests.py
│   └── management/
│       └── commands/
│           ├── import_xml.py       (import IETM XML into DB)
│           └── prepare_deployment.py (multi-phase deployment prep)
│
├── groups_api/                 ← Department / group management
│   ├── models.py               (Department, UserGroup, GroupUser)
│   ├── views.py
│   ├── urls.py
│   └── urls_dept.py
│
├── notes/                      ← General user notes
│   ├── models.py
│   ├── views.py
│   └── urls.py
│
├── topic_notes/                ← Per-topic notes (unique per user+topic)
│   ├── models.py
│   ├── views.py
│   └── urls.py
│
├── search/                     ← Full-text search
│   ├── models.py               (RecentSearch)
│   ├── views.py
│   └── urls.py
│
└── rag/                        ← Retrieval-Augmented Generation (chatbot)
    ├── api_views.py            (RagChatView — SSE streaming endpoint)
    ├── pipeline.py             (rag_stream orchestrator)
    ├── vector_store.py         (flat-file cosine similarity store)
    ├── embeddings.py           (Ollama embedding calls)
    ├── llm.py                  (Ollama chat streaming)
    ├── html_utils.py
    ├── urls.py
    └── management/
        └── commands/
            └── generate_embeddings.py
```

---

## frontend/src/

```
frontend/src/
├── main.tsx                    ← React app entry point
├── vite-env.d.ts
│
├── app/
│   ├── App.tsx                 ← Root component; owns all top-level state
│   ├── LoginPage.tsx           ← Login form
│   ├── PrivateRoute.tsx        ← Route guards (PrivateRoute, AdminRoute)
│   │
│   ├── pages/
│   │   ├── AdminLayout.tsx     ← Admin section layout wrapper
│   │   └── admin/
│   │       ├── UsersPage.tsx   ← Admin: user management (CRUD)
│   │       └── GroupsPage.tsx  ← Admin: group management (CRUD)
│   │
│   └── components/
│       ├── TopBar.tsx          ← Header: title, user info, language toggle
│       ├── Header.tsx          ← Nav bar: history, search, breadcrumbs
│       ├── LeftPanel.tsx       ← Icon sidebar: navigation buttons
│       ├── Sidebar.tsx         ← TOC tree panel
│       ├── ContentArea.tsx     ← Main content renderer (blocks, tables, media)
│       ├── StatusBar.tsx       ← Footer: role, page numbers
│       ├── Dashboard.tsx       ← User dashboard modal
│       ├── HomeScreen.tsx      ← Home page: document cards
│       ├── DocumentIndexPage.tsx ← List of Figures / List of Tables
│       ├── BookmarksDialog.tsx ← Bookmarks list modal
│       ├── NotesListDialog.tsx ← Notes list modal
│       ├── NotepadDialog.tsx   ← Note create/edit modal
│       ├── HelpDialog.tsx      ← Help modal
│       ├── AbbreviationsDialog.tsx ← Abbreviations table modal
│       ├── PrepagesViewer.tsx  ← Fullscreen PDF viewer (prepages)
│       ├── MediaFullscreen.tsx ← Image viewer: zoom, pan, hotspot overlays
│       ├── ModelViewer3D.tsx   ← Three.js 3D model viewer (GLB/OBJ)
│       ├── KnowledgeTreeView.tsx ← Interactive knowledge graph
│       ├── ChatPanel.tsx       ← RAG chat interface
│       ├── figma/
│       │   └── ImageWithFallback.tsx
│       └── knowledge-tree/
│           ├── TreeCanvas.tsx
│           ├── TreeConnectors.tsx
│           ├── TreeNode.tsx
│           ├── useTreeLayout.ts
│           └── types.ts
│
├── context/
│   ├── AuthContext.tsx         ← Auth state (user, token, login/logout)
│   ├── NetworkContext.tsx      ← Online/offline status
│   └── ThemeContext.tsx        ← Theme presets (8 themes)
│
├── services/
│   ├── authService.ts          ← login(), logout(), getStoredUser()
│   ├── contentService.ts       ← getDocuments(), getToc(), getTopic(), search(), …
│   ├── bookmarkService.ts      ← list(), add(), remove()
│   ├── notesService.ts         ← list(), save(), remove()
│   ├── activityService.ts      ← log(), searchHistoryService
│   ├── adminService.ts         ← user/group CRUD API calls
│   └── chatService.ts          ← streamChat() SSE client
│
├── lib/
│   ├── apiClient.ts            ← HTTP client (get/post/put/delete + auth header)
│   ├── db.ts                   ← IndexedDB wrapper (offline cache, ietm-offline v2)
│   ├── syncQueue.ts            ← Offline sync queue drain + listeners
│   ├── i18n.ts                 ← i18next config (EN / HI)
│   └── types.ts                ← Core TS types (AuthUser, TocItem, ContentBlock, …)
│
├── locales/
│   ├── en.json                 ← English translation strings
│   └── hi.json                 ← Hindi translation strings
│
└── styles/
    ├── content.css             ← IETM content block styles
    ├── fonts.css
    ├── index.css
    ├── tailwind.css
    └── theme.css
```

---

## pipeline_updated/

```
pipeline_updated/
├── pipeline_server.py          ← HTTP server for pipeline orchestration UI
│
└── ietm_pipeline/
    ├── __init__.py
    ├── config.py               ← PipelineConfig dataclass (style/regex patterns)
    ├── context.py              ← PipelineContext (warnings & stats accumulator)
    ├── models.py               ← Full IR: DocumentNode, SectionNode, LeafNode,
    │                              FigureNode, TableNode, ListNode, VideoNode, …
    ├── main.py                 ← CLI entry: convert, convert-s1000d, list, unregister
    │
    ├── docx_reader.py          ← Stage 1: parse .docx → flat element list
    ├── s1000d_reader.py        ← Stage 1 (alt): parse S1000D XML → DocumentNode
    ├── content_classifier.py   ← Stage 2: classify elements (HEADING/FIGURE/TABLE/…)
    ├── tree_builder.py         ← Stage 3: flat classified list → DocumentNode tree
    ├── text_parser.py          ← Extract TextRun list from paragraph XML elements
    ├── table_parser.py         ← Parse w:tbl elements → TableNode
    ├── image_extractor.py      ← Extract & convert images (WMF→PNG via LibreOffice)
    ├── hotspot_merger.py       ← Stage 4: inject hotspots.json into FigureNodes
    ├── xref_resolver.py        ← Stage 5: replace figure/table text → XRefRun nodes
    ├── xml_emitter.py          ← Stage 6: DocumentNode → ietm_output.xml
    ├── master_registry.py      ← Register/unregister documents in master.xml
    └── utils.py                ← Shared helpers (qn, normalize_whitespace, make_*_id)
```

---

## Image Upload Form Design (1)/

```
Image Upload Form Design (1)/
├── server/                     ← Node.js TypeScript server
│   ├── index.ts                ← HTTP server entry; request routing
│   ├── autoDetect.ts           ← Auto-detection logic for hotspot regions
│   ├── embeddingService.ts     ← Text embedding service integration
│   └── xmlService.ts           ← XML read/write for hotspot injection
│
└── src/
    ├── main.tsx                ← React entry point
    └── app/
        ├── App.tsx             ← Root component: hotspot editor state machine
        ├── types.ts            ← Interfaces: DocumentInfo, HotspotData, FigureData, …
        ├── lib/
        │   └── api.ts          ← All API calls (fetch docs/figures/sections,
        │                          submit/detect/write/OCR hotspots, expiry check)
        └── components/
            ├── ApprovalPanel.tsx         ← Sidebar: approval checkboxes, batch write
            ├── FullscreenImageViewer.tsx ← Draw/edit hotspots on image; OCR regions
            └── TargetSectionPicker.tsx   ← Searchable dropdown for hotspot targets
```

---

*Generated by Project_walkthrough setup — covers all custom-authored source files.*
