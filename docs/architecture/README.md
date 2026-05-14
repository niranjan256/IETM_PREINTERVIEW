# Architecture diagrams

Four Mermaid diagrams that together document the **backend half** of the IETM stack (mirroring the existing frontend component diagram).

| # | File | What it shows | Best for |
|---|---|---|---|
| 1 | [backend-architecture.md](./backend-architecture.md) | Django entry → middleware → URL router → each app's URLs/views/models → database. All 8 apps in subgraphs. | Understanding "where does request X land?" |
| 2 | [database-schema.md](./database-schema.md) | Full ER diagram of all 16 tables with every column, type, and foreign key. | Understanding the data model and writing queries. |
| 3 | [api-flow.md](./api-flow.md) | Frontend service → `apiClient.ts` → backend app mapping, plus a sequence diagram for login + authenticated fetch + 401 reset. | Tracing a request end-to-end from React to a DB row. |
| 4 | [content-tree.md](./content-tree.md) | Zoom-in on the content domain: XML → `import_xml` → 7 content tables → 8 API endpoints → frontend consumers. | Understanding the IETM document model (the heart of the app). |

## How to view

Mermaid renders inline on GitHub. Locally:

- **VS Code:** install the "Markdown Preview Mermaid Support" extension, then open any of the `.md` files in preview.
- **Online:** copy any ```` ```mermaid ```` block into https://mermaid.live.
- **PNG export (optional):**
  ```bash
  npx -p @mermaid-js/mermaid-cli mmdc -i backend-architecture.md -o backend-architecture.png
  ```

## Where to start

If you've never seen the codebase before, read in this order: **3 → 1 → 4 → 2**.
That gives you the end-to-end request flow first, then drills into structure, then the central content domain, and finally the full schema.
