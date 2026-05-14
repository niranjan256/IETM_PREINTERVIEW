# API Flow — Frontend ↔ Backend

How a request travels from a React component down to a database row, and back. Two diagrams:

1. **Service-to-app mapping** — flowchart showing every frontend service and the backend app it talks to.
2. **Auth & request sequence** — sequence diagram for login, an authenticated fetch, and the 401 reset.

---

## 1. Service-to-app mapping

```mermaid
flowchart LR
    %% ============ REACT COMPONENTS ============
    subgraph UI["React components"]
        direction TB
        ui_top["TopBar"]:::ui
        ui_view["MainViewerLayout"]:::ui
        ui_tree["KnowledgeTreeView"]:::ui
        ui_content["ContentArea"]:::ui
        ui_notes["NotesDialog · NotepadDialog"]:::ui
        ui_book["BookmarksDialog"]:::ui
        ui_doc["DocIndexPage"]:::ui
        ui_search["Search input"]:::ui
        ui_admin["AdminLayout<br/>UsersPage · GroupsPage"]:::ui
        ui_login["LoginPage"]:::ui
    end

    %% ============ CONTEXTS ============
    subgraph CTX["Contexts"]
        direction TB
        ctx_auth["AuthContext"]:::ctx
        ctx_net["NetworkContext"]:::ctx
    end
    ui_login --> ctx_auth
    ui_top --> ctx_auth
    ui_view --> ctx_auth
    ui_admin --> ctx_auth

    %% ============ FRONTEND SERVICES ============
    subgraph FE["frontend/src/services & lib"]
        direction TB
        s_auth["authService.ts<br/>login · logout · getStoredUser"]:::svc
        s_content["contentService.ts<br/>getDocuments · getToc · getTopic<br/>resolveXref · search · getDocumentIndex<br/>getPrepages · getAbbreviations"]:::svc
        s_notes["notesService.ts<br/>list · get · save · remove"]:::svc
        s_book["bookmarkService.ts<br/>list · add · remove"]:::svc
        s_admin["adminService.ts<br/>users CRUD · groups CRUD<br/>assignUsersToGroup · listDepartments"]:::svc
        s_act["activityService.ts<br/>log()"]:::svc
        s_search["searchHistoryService<br/>record()"]:::svc
        s_client["apiClient.ts<br/>buildHeaders() · get/post/put/patch/delete<br/>Authorization: Token &lt;t&gt;<br/>401 → clear localStorage + 'unauthorized' event"]:::client
        s_db["db.ts (IndexedDB 'ietm-offline')<br/>toc · topics · bookmarks · notes<br/>pendingSync · xrefCache"]:::offline
        s_sync["syncQueue.ts<br/>drainSyncQueue()<br/>(on 'online' + visibility events)"]:::offline
    end

    %% Component → service wires
    ctx_auth --> s_auth
    ui_view --> s_content
    ui_tree --> s_content
    ui_content --> s_content
    ui_doc --> s_content
    ui_search --> s_content
    ui_search --> s_search
    ui_notes --> s_notes
    ui_book --> s_book
    ui_admin --> s_admin
    ui_top --> s_act
    ui_view --> s_act

    %% Service → apiClient + offline
    s_auth --> s_client
    s_content --> s_client
    s_notes --> s_client
    s_book --> s_client
    s_admin --> s_client
    s_act --> s_client
    s_search --> s_client

    s_content -. cache read/write .-> s_db
    s_notes -. write-through + queue .-> s_db
    s_book -. write-through + queue .-> s_db
    s_db --> s_sync
    s_sync -. retry .-> s_client

    %% ============ NETWORK BOUNDARY ============
    s_client ==>|"HTTP /api/*<br/>Token auth"| router["ietm_backend/urls.py<br/>(root router)"]:::router

    %% ============ BACKEND APPS ============
    subgraph BE["Django apps"]
        direction TB
        be_auth["auth_api<br/>/api/auth/{login,register,logout}"]:::beapp
        be_admin["admin_api<br/>/api/admin/users[/...]"]:::beapp
        be_groups["groups_api<br/>/api/groups · /api/departments"]:::beapp
        be_content["content<br/>/api/content/*"]:::beapp
        be_book["bookmarks<br/>/api/bookmarks/*"]:::beapp
        be_tnotes["topic_notes<br/>/api/topic-notes/*"]:::beapp
        be_search["search<br/>/api/search/*"]:::beapp
        be_act["activity<br/>/api/activity/*"]:::beapp
    end

    router --> be_auth
    router --> be_admin
    router --> be_groups
    router --> be_content
    router --> be_book
    router --> be_tnotes
    router --> be_search
    router --> be_act

    %% Service ↔ app affinity (labeled)
    s_auth -. talks to .-> be_auth
    s_content -. talks to .-> be_content
    s_notes -. talks to .-> be_tnotes
    s_book -. talks to .-> be_book
    s_admin -. talks to .-> be_admin
    s_admin -. talks to .-> be_groups
    s_act -. talks to .-> be_act
    s_search -. talks to .-> be_search

    %% ============ DATABASE ============
    DB[("Database<br/>(SQLite / PostgreSQL)")]:::db
    be_auth --> DB
    be_admin --> DB
    be_groups --> DB
    be_content --> DB
    be_book --> DB
    be_tnotes --> DB
    be_search --> DB
    be_act --> DB

    %% ============ STYLES ============
    classDef ui fill:#e3f2fd,stroke:#1565c0,stroke-width:1px,color:#0a1e3a
    classDef ctx fill:#fff3e0,stroke:#e65100,stroke-width:1px,color:#2a1505
    classDef svc fill:#fff8e1,stroke:#8a7a3e,stroke-width:1px,color:#1f1f1f
    classDef client fill:#ffe0b2,stroke:#bf6a00,stroke-width:2px,color:#2a1505
    classDef offline fill:#e6d4ff,stroke:#7b4cb0,stroke-width:1px,color:#1f0f3a
    classDef router fill:#ffd9b3,stroke:#c97c1f,stroke-width:2px,color:#2e1a05
    classDef beapp fill:#ffe1ec,stroke:#b8417c,stroke-width:1px,color:#2a0a18
    classDef db fill:#c8e6c9,stroke:#2e7d32,stroke-width:2px,color:#0a2e0a
```

### Service → app mapping (cheat sheet)

| Frontend service | Backend app | Notes |
|---|---|---|
| `authService.ts` | `auth_api` | Token-based; stores token in localStorage |
| `contentService.ts` | `content` | Reads cache from IndexedDB on network failure |
| `notesService.ts` | `topic_notes` | Confusingly named — talks to `/api/topic-notes/`, NOT the legacy `/api/notes/` |
| `bookmarkService.ts` | `bookmarks` | Offline write-through + queue |
| `adminService.ts` | `admin_api` + `groups_api` | Hits two apps via one service |
| `activityService.ts` | `activity` | Fire-and-forget |
| `searchHistoryService` | `search` | Fire-and-forget |

**Note:** The frontend service `notesService.ts` talks to `/api/topic-notes/` — the backend's `notes` app is legacy code with no current frontend consumer.

### Offline path

The offline branch (purple) is **only on writes** for `notesService.ts` and `bookmarkService.ts`:

1. User saves a note while offline → `notesService.save()` writes to `offlineDb` immediately.
2. On error, queues a `pendingSync` action.
3. When the browser fires `online` or the tab becomes visible, `syncQueue.drainSyncQueue()` replays the queue against `apiClient`.

Reads (admin, auth, etc.) **do not** use the offline cache — they fail with an error if the network is down.

---

## 2. Authenticated request lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant R as React component
    participant AC as AuthContext
    participant AS as authService
    participant API as apiClient.ts
    participant LS as localStorage
    participant DJ as Django router<br/>(ietm_backend/urls.py)
    participant V as auth_api.views.login
    participant ORM as Django ORM
    participant DB as Database

    %% ---- Login ----
    rect rgb(255, 246, 224)
    Note over U,DB: LOGIN
    U->>R: Submit login form (username, password)
    R->>AC: login(username, password)
    AC->>AS: authService.login(u, p)
    AS->>API: apiClient.post("/auth/login", {u, p})
    API->>DJ: POST /api/auth/login (no Authorization header yet)
    DJ->>V: route to auth_api.views.login
    V->>ORM: User.objects.get(username=u)
    ORM->>DB: SELECT * FROM users WHERE username=...
    DB-->>ORM: row
    ORM-->>V: User instance
    V->>V: bcrypt.checkpw(password, password_hash)
    V->>ORM: Token.objects.create(user=user)
    ORM->>DB: INSERT INTO authtoken_token ...
    V-->>DJ: 200 {success, token, user:{id, username, role}}
    DJ-->>API: 200 JSON
    API-->>AS: response
    AS->>LS: setItem("token", t), setItem("userId", ...), ("role", ...), ("username", ...)
    AS-->>AC: user
    AC-->>R: state.user updated
    R-->>U: redirect to /viewer
    end

    %% ---- Authenticated read ----
    rect rgb(232, 244, 253)
    Note over U,DB: AUTHENTICATED FETCH (e.g. open a topic)
    U->>R: navigate to topic #42
    R->>AS: (uses contentService)
    AS->>API: apiClient.get("/content/topic/42/")
    API->>LS: getItem("token")
    LS-->>API: t
    API->>DJ: GET /api/content/topic/42/<br/>Header: Authorization: Token t
    DJ->>DJ: DRF TokenAuthentication resolves t → user
    DJ->>V: content.api_views.content_topic(pk=42)
    V->>ORM: ContentNode.objects.get(pk=42) + blocks + media + xrefs
    ORM->>DB: SELECT (JOINs across content_*)
    DB-->>ORM: rows
    ORM-->>V: assembled topic
    V-->>DJ: 200 {node, blocks, media, hotspots, breadcrumbs, prev, next}
    DJ-->>API: 200 JSON
    API-->>R: payload
    R-->>U: render topic
    end

    %% ---- 401 reset ----
    rect rgb(255, 224, 224)
    Note over U,DB: 401 RESET (token expired / invalid)
    R->>API: apiClient.get("/admin/users")
    API->>DJ: GET ... with Token
    DJ-->>API: 401 Unauthorized
    API->>LS: clear token, userId, role, username
    API->>R: dispatchEvent('unauthorized')
    AC->>AC: listener sees 'unauthorized' → setUser(null)
    R-->>U: redirect to /login
    end
```

---

## Key source files

| Layer | File | Lines |
|---|---|---|
| API client | [frontend/src/lib/apiClient.ts](../../frontend/src/lib/apiClient.ts) | 1–92 |
| Auth context | [frontend/src/context/AuthContext.tsx](../../frontend/src/context/AuthContext.tsx) | 22–63 |
| Offline DB | [frontend/src/lib/db.ts](../../frontend/src/lib/db.ts) | — |
| Sync queue | [frontend/src/lib/syncQueue.ts](../../frontend/src/lib/syncQueue.ts) | 40–43 |
| Services | [frontend/src/services/*.ts](../../frontend/src/services/) | — |
| Root router | [backend/ietm_backend/urls.py](../../backend/ietm_backend/urls.py) | 10–25 |
| Auth views | [backend/auth_api/views.py](../../backend/auth_api/views.py) | — |
| Content API views | [backend/content/api_views.py](../../backend/content/api_views.py) | — |
| Settings (REST_FRAMEWORK) | [backend/ietm_backend/settings.py](../../backend/ietm_backend/settings.py) | — |
