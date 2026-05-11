# Claude Skills & Conventions for This Project

This file documents which Claude Code skills are useful for this project and project-specific conventions Claude should follow.

---

## Recommended skills (slash commands)

### `/review`
Run before merging any pipeline or backend changes. This project has **no CI/CD pipeline**, so manual review is the only gate.
- Use when: adding a new pipeline stage or changing Django models/serializers.

### `/security-review`
Run when touching auth, access groups, or the security/ACL marker system in the pipeline.
- Use when: modifying `auth_api/`, `groups_api/`, `content_classifier.py`, or `_parse_heading_markers()` in `main.py`.

### `/simplify`
Run after adding new pipeline modules or React components to check for unnecessary complexity or duplication.
- Use when: a new pipeline stage module or a new React component has been added.

### `/init`
Run inside a new subfolder when a new Django app or React micro-app is created.
- Use when: `python manage.py startapp <name>` is run, or a new standalone React app is scaffolded.

### `/fewer-permission-prompts`
Run once after a heavy dev session to reduce repetitive approval prompts for safe read-only Bash calls.
- Use when: Claude has been asking permission for `ls`, `grep`, `cat` on known-safe project paths repeatedly.

---

## Project conventions Claude must follow

### Package manager
- **Frontend**: always use `pnpm`. Never `npm install` or `yarn` inside `frontend/`.
- **Backend**: always activate the virtualenv first: `venv\Scripts\activate` (Windows) or `source venv/bin/activate` (Linux/Mac).

### Pipeline
- **Always use `pipeline_updated/`** — `pipeline/` is legacy and must not be edited.
- When adding a new pipeline stage, add it to the ordered stage list in `pipeline_updated/CLAUDE.md`.

### Django
- New model fields → run `makemigrations` + `migrate` + update `import_xml.py` if the field comes from XML.
- API endpoints require token auth unless explicitly noted otherwise.

### Frontend
- New translation strings → update both `src/locales/en.json` and `src/locales/hi.json`.
- TOC synthetic IDs (like `__prepages__`) must not conflict with real `ContentNode` PKs (which are integers).

### Deployment
- Local dev uses `.env` with `IETM_MODE=standalone` (SQLite).
- Do not commit secrets (`.env` is in `.gitignore`).
