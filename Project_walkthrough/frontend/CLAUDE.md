# React Frontend — Claude Guide

Parent overview: [`../CLAUDE.md`](../CLAUDE.md)

Package manager: **pnpm only** (lockfile enforced — don't use npm or yarn).

---

## Dev server & build

```bash
cd "Offline SPA with Navigation (1)"
pnpm install
pnpm dev        # http://localhost:5173 (proxies /api → Django :8000)
pnpm build      # outputs to dist/
```

---

## Component hierarchy

```
App.tsx
├── LoginPage          (unauthenticated route)
└── PrivateRoute
    └── Layout
        ├── LeftPanel       icon bar: Home, Dashboard, Abbreviations, Notes, Bookmarks, Help, Logout
        ├── Sidebar         TOC tree (driven by tocItems state in App)
        ├── TopBar          breadcrumb, search bar, language toggle
        └── ContentArea     renders the selected node's content blocks
            ├── ModelViewer3D       GLB/OBJ via Three.js / react-three-fiber
            ├── MediaFullscreen     image overlay — zoom 50–400%, pan, hotspot overlays
            └── PrepagesViewer      fullscreen PDF dialog (<iframe>)
```

---

## State flow

- **Auth token** — stored in `localStorage` via `lib/apiClient.ts`. Injected as `Authorization: Token <token>` header on every request.
- **TOC items** — built in `App.tsx` via `Promise.all([getPrepages(), getDocuments()])`. Set in one `setTocItems()` call to avoid race conditions. Passed down as props.
- **Selected node** — managed in `App.tsx`, passed to `ContentArea` and `TopBar`.
- **Dialog state** — `PrepagesViewer`, `AbbreviationsDialog`, Notes, Bookmarks — all controlled by boolean state in `App.tsx`.

---

## Key components

| File | Responsibility |
|------|---------------|
| `app/App.tsx` | Root: routing, TOC construction, dialog state, auth guard |
| `app/LoginPage.tsx` | Login form — POSTs to `/api/auth/login/` |
| `app/PrivateRoute.tsx` | Redirects unauthenticated users to `/login` |
| `app/components/ContentArea.tsx` | Renders content blocks: text, tables, figures, 3D models, videos, PDFs, hotspots |
| `app/components/LeftPanel.tsx` | Icon sidebar — triggers dialogs (Abbreviations, Notes, Bookmarks) |
| `app/components/TopBar.tsx` | Breadcrumb, search input, language switcher |
| `app/components/ModelViewer3D.tsx` | Three.js GLB/OBJ viewer with orbit controls |
| `app/components/MediaFullscreen.tsx` | Fullscreen image viewer — zoom, pan, percentage-positioned hotspot overlays |
| `app/components/PrepagesViewer.tsx` | Fullscreen `<iframe>` dialog for the prepages PDF global asset |
| `app/components/AbbreviationsDialog.tsx` | Searchable abbreviations table (fetches `/api/content/abbreviations/`) |
| `app/components/TreeCanvas.tsx` | Knowledge tree visualization (recharts) |

---

## Service layer (`src/services/`)

| File | What it does |
|------|-------------|
| `contentService.ts` | `getDocuments()`, `getNode()`, `getPrepages()`, `getAbbreviations()`, `search()` |
| `authService.ts` | `login()`, `logout()`, `getCurrentUser()` |
| `bookmarkService.ts` | CRUD for bookmarks |
| `noteService.ts` | CRUD for notes |
| `activityService.ts` | POST activity events |
| `adminService.ts` | Admin-only calls |

Base URL configured in `lib/apiClient.ts` — reads `VITE_API_BASE_URL` env var (defaults to `http://localhost:8000`).

---

## TOC structure & synthetic entries

`App.tsx` builds `TocItem[]` from the API response. The **prepages** global asset gets a synthetic entry:

```ts
{ id: "__prepages__", title: "Prepages", type: "prepages" }
```

Clicking `__prepages__` opens `PrepagesViewer`. All other IDs are `ContentNode` PKs that navigate to a topic. **Never reuse the `__prepages__` id for real content nodes.**

---

## Media panel architecture (current → planned)

### Current (split arrays)
`content_topic` returns two separate arrays:
- `blocks[]` — text, lists, tables + caption-only stubs for figures/media
- `mediaItems[]` — all media for the topic, independently ordered

`ContentArea` tracks `activeMediaIndex: number` into `mediaItems[]`. The thumbnail strip and right panel are driven by this index. This means media render order can diverge from XML document order.

### Planned (linear block stream — approved, not yet implemented)
- `blocks[]` will include full `media` payload inline on figure/model3d/video/pdf blocks (each has `blockId`, `xmlId`, `media: MediaItem | null`).
- `activeMediaBlockId: number | null` replaces `activeMediaIndex`.
- Thumbnail strip sourced from `blocks.filter(b => b.media != null)` — XML order preserved.
- `mediaItems[]` kept in response during transition (Phase 2), removed in Phase 3.
- See full plan: `C:\Users\niran\.claude\plans\rustling-squishing-gadget.md`

**Do not add new features that depend on `mediaItems[]` order** — that array is scheduled for removal.

---

## Hotspot + zoom system (`MediaFullscreen.tsx`)

- Hotspots are percentage-positioned `<div>` overlays inside the same scaled wrapper as the image — so they stay aligned at all zoom levels.
- Zoom range: **50%–400%** via `+`/`-` buttons or keyboard `+`/`-`.
- Pan: pointer drag when zoom > 100%; arrow keys as accessibility fallback.
- `transformOrigin: center center` — zoom centres on the image.
- Clicking a hotspot closes the overlay and navigates to the target `ContentNode`.
- Hotspot target may be a `LEAF` node — the API transparently redirects to its parent `LEAF_GROUP`, so prev/next navigation works correctly after a hotspot click.

---

## i18n

Locales: `src/locales/en.json` (English), `src/locales/hi.json` (Hindi).

To add a new translation key:
1. Add to `en.json` and `hi.json`
2. Use `const { t } = useTranslation()` in the component, then `t('your.key')`

Language toggle is in `TopBar` — switches via `i18next.changeLanguage()`.

---

## Offline / PWA

- **IndexedDB** (`lib/db.ts`) — stores content for offline viewing.
- **Sync queue** (`lib/syncQueue.ts`) — queues mutations (bookmarks, notes, activity) when offline; replays on reconnect.
- PWA manifest + service worker generated by `vite-plugin-pwa` at build time.

Use `lib/db.ts` for read caching. Use `lib/syncQueue.ts` for write operations that must survive offline periods.

---

## Content CSS (`src/styles/content.css`)

Key rules and their rationale:

| Rule | Detail |
|------|--------|
| `.cals-table { table-layout: auto }` | Column widths sized by content, not equal split. `fixed` was removed — auto is correct for IETM tables where column content varies widely. |
| `.table-caption` | `padding: 6px 10px 4px 10px; display: block; margin-bottom: 0` — ensures caption is padded off the left edge and has minimal top/bottom space. |
| `.cals-table td.spanning-header` | `text-align: center; font-weight: 600; background: var(--ietm-table-header-bg)` — for rows where a single cell spans all columns (e.g. section headers within a table). Class is applied by `import_xml._render_table_row()` when colspan equals total column count. |
| `.section-highlight` / `.topic-content-wrapper.section-highlight` | Animated highlight for search result and xref scroll targets — blue left border fade-in. |
| `.image-hotspot` / `.image-hotspot.active` | Percentage-positioned hotspot overlays on figures. Active (clicked) state shows red outline. |

---

## Key dependencies

| Package | Purpose |
|---------|---------|
| `react-router` 7 | Routing |
| `@react-three/fiber` + `@react-three/drei` | 3D model viewer |
| `three` 0.170 | WebGL / Three.js |
| `i18next` + `react-i18next` | Internationalisation |
| `@radix-ui/*` | Accessible UI primitives (dialogs, dropdowns, etc.) |
| `tailwindcss` 4 | Utility-first styling |
| `motion` | Animations |
| `sonner` | Toast notifications |
| `recharts` | Charts (knowledge tree) |
| `react-markdown` + `remark-gfm` | Markdown rendering |
