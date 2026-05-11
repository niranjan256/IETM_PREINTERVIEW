# Python Pipeline — Claude Guide

Parent overview: [`../CLAUDE.md`](../CLAUDE.md)

**Always use `pipeline_updated/`. `pipeline/` is legacy — do not edit it.**

---

## CLI entry point (`ietm_pipeline/main.py`)

```bash
# Convert DOCX → IETM XML
python -m ietm_pipeline.main convert <docx> <ietm_root>

# With optional enrichment
python -m ietm_pipeline.main convert <docx> <ietm_root> \
  --hotspots hotspots.json \
  --models model_manifest.json \
  --media media_manifest.json \
  --access-groups "ARMAMENT,SECRET"

# Convert S1000D Data Module XML (skips DOCX stages)
python -m ietm_pipeline.main convert-s1000d <dm.xml> <ietm_root>

# Register global assets (once per IETM root)
python -m ietm_pipeline.main add-global <ietm_root> \
  --prepages path/to/prepages.pdf \
  --prepages-title "Prepages" \
  --abbreviations path/to/abb.csv \
  --abbreviations-title "Abbreviations"

# List documents registered in an IETM root
python -m ietm_pipeline.main list <ietm_root>

# Unregister a document
python -m ietm_pipeline.main unregister <ietm_root> <doc_id>
```

---

## Pipeline stages (in order)

```
DOCX input
  ↓ docx_reader.py      Read .docx, extract heading tree + text + embedded images
  ↓ tree_builder.py     Build document AST (SectionNode / LeafNode hierarchy)
  ↓ hotspot_merger.py   Inject hotspots.json / model_manifest.json / media_manifest.json
  ↓ image_extractor.py  Extract images from DOCX ZIP; convert browser-incompatible formats
  ↓ xml_emitter.py      Serialise AST → IETM XML file + images/ directory
  ↓ master_registry.py  Register document in master.xml
```

S1000D path: `s1000d_reader.py` → `DocumentNode` (skips docx_reader + tree_builder).

---

## Module reference

| File | Role |
|------|------|
| `models.py` | IR dataclasses shared by all stages |
| `config.py` | `PipelineConfig`; regex constants `SECURITY_MARKER_RE`, `ACCESS_GROUP_RE` |
| `docx_reader.py` | Reads `.docx`, builds heading tree |
| `s1000d_reader.py` | Reads S1000D XML → `DocumentNode` |
| `tree_builder.py` | Builds document AST from heading tree |
| `xml_emitter.py` | Writes IETM XML output |
| `hotspot_merger.py` | Merges the three manifest files into the AST |
| `content_classifier.py` | Content type classification |
| `xref_resolver.py` | Cross-reference resolution |
| `text_parser.py` | Text / inline formatting parsing |
| `table_parser.py` | Table parsing |
| `context.py` | Pipeline context object (passed through all stages) |
| `master_registry.py` | `register()`, `list_manuals()`, `register_global_asset()`, `list_global_assets()` |
| `image_extractor.py` | Image extraction + format conversion |
| `main.py` | CLI — parses args, orchestrates stages, calls `_parse_heading_markers()` |

---

## AST node types (`models.py`)

| Node | When used | Key fields |
|------|-----------|-----------|
| `DocumentNode` | Root | `doc_id`, `title`, `sections: List[SectionNode]` |
| `SectionNode` | Every heading | `number`, `title`, `level`, `blocks`, `children: List[SectionNode]` |
| `LeafNode` | Terminal section with content | `blocks: List[Block]` |
| `ParagraphNode` | Text paragraph | `runs: List[Run]`, `para_type` (`warning`/`caution`/`note`/`step`) |
| `ListNode` | Ordered/unordered list | `list_type: ListType`, `items: List[ListItemNode]` |
| `FigureNode` | Image | `src`, `caption`, `hotspots: List[HotspotNode]` |
| `Model3DNode` | 3D model | `src`, `format` (`glb`/`obj`), `hotspots: List[MeshHotspotNode]` |
| `VideoNode` | Video | `src`, `caption` |
| `PdfNode` | Inline PDF | `src`, `caption` |
| `TableNode` | Table | `rows` (JSON-serialisable) |
| `HotspotNode` | Image region hotspot | `x, y, w, h` (px), `target` (section ID), `label`, `desc` |
| `MeshHotspotNode` | 3D mesh hotspot | `mesh_name`, `target`, `label` |

Inline content: `TextRun` (bold/italic/underline), `XRefRun` (cross-reference).

---

## Manifest file formats

### `hotspots.json`
```json
{
  "figure_id": [
    { "x": 100, "y": 50, "w": 80, "h": 60, "target": "sec-1.1.2", "label": "Engine block", "desc": "Main engine block" }
  ]
}
```

### `model_manifest.json`
```json
[
  {
    "section_id": "sec-1.2",
    "src": "models/engine.glb",
    "format": "glb",
    "hotspots": [
      { "mesh": "Piston_001", "target": "sec-1.2.1", "label": "Piston" }
    ]
  }
]
```

### `media_manifest.json`
```json
[
  { "section_id": "sec-1.3", "type": "video", "src": "media/assembly.mp4", "caption": "Assembly procedure" },
  { "section_id": "sec-1.4", "type": "pdf",   "src": "media/spec.pdf",     "caption": "Specification" }
]
```

---

## Security / ACL markers

`_parse_heading_markers()` in `main.py` strips bracket tokens from heading titles:

| Marker in heading | Sets on node |
|------------------|--------------|
| `[SECRET]` | `securityClass="SECRET"` |
| `[RESTRICTED]` | `securityClass="RESTRICTED"` |
| `[ARMAMENT]` | `accessGroups="ARMAMENT"` |
| Multiple groups | Comma-separated in `accessGroups` |

Example: heading `"1.1 Engine Assembly [SECRET][ARMAMENT]"` → title `"Engine Assembly"`, `securityClass="SECRET"`, `accessGroups="ARMAMENT"`.

---

## Image format conversion (`image_extractor.py`)

| Format | Action |
|--------|--------|
| `.png .jpg .jpeg .gif .webp .svg` | Copied as-is |
| `.tif .tiff .bmp .wdp .jxr .ico .tga` | Converted → PNG via Pillow |
| `.wmf .emf` | Converted → PNG via `soffice --headless` (LibreOffice); original kept as `<name>.original` if conversion fails |
| Unknown | Pillow conversion attempted; kept as-is on failure |

**LibreOffice prerequisite**: install LibreOffice and ensure `soffice` is on `PATH` for WMF/EMF conversion. If not installed, WMF/EMF files are kept as `.original` and skipped.

---

## master.xml schema

```xml
<ietm-master version="1.0">
  <global-assets>
    <prepages file="_global/prepages.pdf" title="Prepages"/>
    <abbreviations file="_global/abbreviations.csv" title="Abbreviations"/>
  </global-assets>
  <manual docId="DOC_001" title="Engine TM" file="doc_001/ietm_output.xml"
          docType="Technical Manual" classification="UNCLASSIFIED"/>
</ietm-master>
```

Global assets live in `<ietm_root>/_global/`. Managed by `master_registry.register_global_asset()`.

---

## List classification rules

`content_classifier.py` + `tree_builder.py` apply these rules to detect ordered lists:

| Rule | Detail |
|------|--------|
| Alphanumeric label format | `(a)`, `a)`, `a.`, `a ` — detected by regex in `content_classifier` |
| **Strict authoring requirement** | Every OL/UL in the source DOCX must have ≥ 2 items. A lone `(a)` paragraph is a false positive; the pipeline converts it back to a plain paragraph and prepends the label as text. |
| Roman/numbered sub-items | Items of type `roman` or `numbered` immediately following an `alpha` item are nested as `sub_items`, not a separate list. |
| Bullet lists | Converted to alpha lists (`a`, `b`, `c`, …) automatically. |
| Prefix stripping | `_strip_list_prefix()` (pipeline) and `_render_list_item()` (import) both strip the label prefix from item text to prevent double-labels like `(a) (a) text`. Uses string-concatenated regex patterns (not f-strings) to avoid `\xa0` encoding issues on Windows. |

---

## Figure vs. table classification

`content_classifier._classify_element()` uses this priority order when encountering a table element:

1. **Figure caption check first**: scan nearby paragraphs for `Figure X.Y` pattern (before and after). If found, treat the entire element (table + images) as a composite figure — regardless of whether it contains images or cells.
2. **Single-image wrapper check**: only if no figure caption found, test `_find_image_rid_in_element()`. This returns `None` for multi-row/multi-cell tables with text content, preventing data tables from being misclassified as figures.

This order matters: composite figures (image grids placed inside a table for layout) always have a `Figure N` caption — checking for the caption first ensures they are never incorrectly classified as data tables.

---

## Hotspot re-import note

Hotspot data is injected by the pipeline at `convert` time (`hotspot_merger.py`). It is stored in the IETM XML, then imported into the DB by `import_xml`.

**If you run `import_xml` without first re-running `convert --hotspots`**, hotspot data from the XML will reflect whatever was in the XML file — it is NOT regenerated from `hotspots.json` during import. Workflow:

```bash
# After editing hotspots.json:
python -m ietm_pipeline.main convert <docx> <ietm_root> --hotspots hotspots.json
python manage.py import_xml --source <ietm_root>/master.xml --clear
```

---

## Common errors & fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `soffice: command not found` | LibreOffice not installed or not on PATH | Install LibreOffice; add to PATH. WMF/EMF files will still be processed without it (kept as `.original`). |
| `PIL: cannot identify image file` | Corrupt or unsupported format | File is kept as-is; check source DOCX |
| `lxml.etree.XMLSyntaxError` | Malformed S1000D XML | Validate source XML against schema |
| `KeyError: 'section_id'` in manifest | Manifest references a non-existent section | Verify section IDs match the DOCX heading numbers |
| Master registry `FileNotFoundError` | `<ietm_root>` doesn't exist yet | Create the root directory first, or run `convert` which creates it |
| Double labels `(a) (a) text` | List prefix stripping broken | Both `_strip_list_prefix` (pipeline) and `_render_list_item` (import) must use string-concatenated regex patterns — do NOT use f-strings or raw strings with special chars on Windows as they may introduce `\xa0` |
| Composite figure missing / becomes unnamed table | Image-in-table false positive | Ensure classifier checks figure caption BEFORE checking for image-in-table wrapper |

---

## Dependencies

```bash
pip install lxml Pillow python-docx
# LibreOffice for WMF/EMF (optional, install separately)
```
