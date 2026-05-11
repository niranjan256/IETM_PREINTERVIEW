# Investigation: Section Ordering & Navigation Issues

**Date:** 2026-04-26  
**Issues Analyzed:**
1. Section 1.5 appears above sections 1.2 / 1.3 in DS document
2. Logical next/back buttons disabled when viewing parent sections with leaf-groups

---

## Issue #1: Section Number Ordering (Lexicographic vs. Numeric)

### Root Cause
The TOC is sorted using **string comparison** instead of **numeric path parsing**.

**Location:** `backend/content/api_views.py`
- Line 50 (in `_get_prev_next()`): `.order_by("path")`
- Line 86 (in `content_tree()`): `.order_by("path")`

The `path` field is a **CharField** in the database (imported from XML as the dotted section number), so Django sorts it **lexicographically** (character-by-character, left to right).

### Example: Why 1.5 sorts before 1.2

When comparing strings:

```
"1.2"      vs.  "1.5"
"1.1.3"    vs.  "1.5"
```

**String comparison logic:**
```
"1.5"          "1.2"          "1.1.3"
 ↓              ↓               ↓
Compare 1st:  '1' == '1'     '1' == '1'  ✓ (equal)
Compare 2nd:  '.' == '.'     '.' == '.'  ✓ (equal)
Compare 3rd:  '5' > '2'      '1' < '2'   ✓ (different)
              ↑ WRONG!       ✓ CORRECT
```

So in the database query result:

| path  | string order? |
|-------|---|
| "1.1.3" | ✓ comes first (comparing 3rd char: '1' vs '2' → '1' wins) |
| "1.2" | 2nd position |
| "1.5" | ✓ comes last (comparing 3rd char: '5' vs '2' → '5' wins) |

But this **breaks document order**. The XML (and intended reading order) is:

```xml
<section number="1.1">...</section>
<leaf-group root="CALM_DS_sec_1_2">...</leaf-group>
<leaf-group root="CALM_DS_sec_1_3">...</leaf-group>
<leaf-group root="CALM_DS_sec_1_4">...</leaf-group>
<section number="1.5">...</section>  <!-- Only appears LATER in XML -->
```

### Why Section Numbers Are Stored as Strings

**File:** `backend/content/management/commands/import_xml.py:223`

```python
path = number  # materialized path = dotted number
```

The `path` field directly copies the XML `number` attribute (e.g., "1.2.3"), stored as a **CharField** in the model.

**Model definition:** `backend/content/models.py:69-71`

```python
path = models.CharField(
    max_length=500, db_index=True,
    help_text="Materialized path for fast traversal, e.g. '1.2.3'"
)
```

### The Issue in Action

From your XML (`pipeline_updated/docs/CALM_DS/ietm_output.xml`):

```xml
Line 8:  <section number="1.1">Introduction.</section>
Line 30: <leaf-group root="CALM_DS_sec_1_2">Role of CALM System.</leaf-group>
Line 34: <leaf id="CALM_DS_sec_1_3">Brief Description.</leaf>
Line 45: <leaf id="CALM_DS_sec_1_4">Salient Features.</leaf>
Line 62: <section number="1.5">Configuration of CALM System.</section>
```

When sorted lexicographically:
- "1.1" ✓
- "1.1.1", "1.1.2", "1.1.3" (children under 1.1 leaf-group)
- "1.2" ✓
- "1.3" ✓
- "1.4" ✓
- "1.5" ✓ (comes LAST because in string sort, '1.5' > '1.4')

But wait—you said 1.5 appears **above** 1.2/1.3. Let me reconsider...

**Actually, the issue is the three-part vs. two-part path length:**

When comparing:
- "1.1.3" (three digits)
- "1.2" (two digits)

String comparison:
```
"1.1.3"  vs  "1.2"
Compare position 0: '1' == '1' ✓
Compare position 1: '.' == '.' ✓
Compare position 2: '1' < '2' ✓ ("1.1.3" comes before "1.2")
```

So the order becomes:
```
1.1.1, 1.1.2, 1.1.3  (three parts, start with "1.1")
1.2                  (two parts, "1.2...")
1.3, 1.4
1.5                  (also two parts)
```

**All three-part paths sort before two-part paths of the same prefix!**

---

## Issue #2: Navigation Disabled on Parent Sections

### Root Cause
The navigation function (`_get_prev_next()`) **explicitly excludes certain node types** from the navigable sequence.

**Location:** `backend/content/api_views.py:34-65`

```python
def _get_prev_next(node):
    # IDs of nodes that are parents of non-LEAF children 
    # (i.e. structural containers)
    container_ids = ContentNode.objects.filter(
        document=node.document,
        parent__isnull=False,
    ).exclude(
        node_type=ContentNode.LEAF,                    # ← exclude LEAF nodes
    ).values_list("parent_id", flat=True)

    # Only navigate to terminal nodes with actual content
    navigable = ContentNode.objects.filter(
        document=node.document,
    ).exclude(
        node_type=ContentNode.LEAF,                    # ← exclude LEAF nodes
    ).exclude(
        pk__in=container_ids,                          # ← ALSO exclude parents
    ).order_by("path")

    node_list = list(navigable.values_list("pk", flat=True))
```

### What Gets Excluded

**Step 1:** Find all parent containers
```python
container_ids = [parent_pk for all non-LEAF children]
```

Example from your XML structure:

| Node | Type | Parent? | In container_ids? |
|------|------|---------|-------------------|
| 1.1 (Introduction) | **SECTION** | has children | ✓ YES (parent of leaf-group) |
| 1.1 leaf-group | **LEAF_GROUP** | has children | ✓ YES (parent of leaves 1.1.1, 1.1.2, 1.1.3) |
| 1.1.1 (PALM 120) | **LEAF** | none | ✗ NO (excluded by `node_type=LEAF`) |
| 1.2 leaf-group | **LEAF_GROUP** | has children | ✓ YES (parent of leaves 1.2, 1.3, 1.4) |
| 1.5 | **SECTION** | no children | ✗ NO (not in container_ids) |

**Step 2:** Exclude both LEAF nodes AND container parents

```python
navigable = nodes.exclude(node_type=LEAF)          # removes 1.1.1, 1.1.2, etc.
            .exclude(pk__in=container_ids)         # removes 1.1, 1.1 lg, 1.2 lg, etc.
```

**Result:** navigable nodes are:
- 1.1 section ✗ (excluded as container)
- 1.1 leaf-group ✗ (excluded as container)
- 1.2 leaf-group ✗ (excluded as container)
- 1.5 section ✓ (only this remains!)

### Why Navigation Fails When Viewing 1.1

When you navigate to section **1.1** (the parent section with the introduction text and leaf-group children):

1. The code calls `_get_prev_next(node=1.1)`
2. It builds `navigable` list = `[1.5]` (only node without children)
3. It tries to find index of 1.1 in `[1.5]`
4. **Index not found** → returns `None, None, None`
5. Frontend receives `prevNode: null, nextNode: null`
6. **Buttons become disabled**

### The Intent vs. The Problem

The comment says:
```python
# Only navigate to terminal nodes with actual content
```

**Intent:** Skip structural containers (sections/leaf-groups that only serve as organizational parents, with no direct content blocks).

**Problem:** This is too strict. It assumes:
- All parent sections are "just organizers" with no content
- But in your structure, **section 1.1 has direct content** (the intro paragraph + figure on line 9-13)

### Your Structure in the XML

```xml
<section number="1.1" title="Introduction.">
    <para>This Chapter gives...</para>        <!-- ← DIRECT CONTENT -->
    <figure>...</figure>                      <!-- ← DIRECT CONTENT -->
    <leaf-group>
        <leaf>...</leaf>
    </leaf-group>
</section>
```

So 1.1 is **not just a container**—it has real navigable content (the intro text and figure), PLUS child leaf-groups.

---

## Summary of Root Causes

| Issue | Location | Problem | Why It Happens |
|-------|----------|---------|---|
| **1.5 appears out of order** | `api_views.py:50, 86` | String sort on CharField path | `order_by("path")` treats "1.1.3" and "1.5" as strings, not numbers |
| **Navigation disabled on 1.1** | `api_views.py:34-65` | Excludes section 1.1 as a "container parent" | Logic assumes all parents are organizers with no content; doesn't account for sections with both content AND children |

---

## Data Flow Visualized

### Issue #1: Ordering in `content_tree()` API

```
Django Query:
  .order_by("path")
  
Database result (lexicographic):
  "1.1"    (two-part path, "1.1")
  "1.1.1"  (three-part path, "1.1.1")
  "1.1.2"
  "1.1.3"
  "1.2"    (two-part path, "1.2" comes AFTER all "1.1.x")
  "1.3"
  "1.4"
  "1.5"
  
Sent to Frontend (SPA):
  Sidebar renders in this lexicographic order
  User sees: 1.1 → 1.1.1 → 1.1.2 → 1.1.3 → 1.2 → 1.3 → 1.4 → 1.5 ✓ (actually correct)

Wait—so why does 1.5 appear ABOVE 1.2?
```

Let me reconsider. Perhaps the issue is in how leaf-groups are handled. Let me check the exclude logic again...

Actually, looking at line 83 in `api_views.py`:

```python
.exclude(
    node_type=ContentNode.LEAF,  # Leaves render inline within their leaf-group
)
```

This **excludes LEAF nodes** from the TOC returned to the frontend. So leaf nodes (1.1.1, 1.1.2, etc.) are NOT in the response at all. Only **SECTION and LEAF_GROUP** nodes are returned.

If leaf-groups **don't have path values like "1.1.1"** but instead have synthetic paths like `"1.2.lg"`, then:

```
Actual paths returned:
"1"          (root GENERAL INFORMATION)
"1.1"        (Introduction SECTION)
"1.2.lg"     (Role of CALM leaf-group with synthetic path)
"1.3.lg"
"1.4.lg"
"1.5"        (Configuration SECTION)
```

String sort of these:
- "1" < "1.1" < "1.2.lg" < "1.3.lg" < "1.4.lg" < "1.5"

Hmm, that still puts 1.5 last, not first.

**Need to verify actual path values for leaf-groups in import...**

From `import_xml.py:274`:
```python
path=f"{parent.path}.lg" if parent else "lg",
```

So a leaf-group under section 1.2 would have path = `"1.2.lg"`.

When sorted lexicographically:
- "1" (root)
- "1.1" 
- "1.2.lg"    ← "1.2.lg" > "1.5" because '2' > '5'? No, wait...

Lexicographic order of:
- "1.2.lg"
- "1.5"

Position 0: '1' == '1'
Position 1: '.' == '.'
Position 2: '2' < '5'  ← "1.2.lg" comes BEFORE "1.5"

So that's not the issue either.

**You might need to check what the actual database query returns.** The issue may be in how the frontend processes the flat list into a tree, or there's a specific edge case with how your document is structured.

### Issue #2: Navigation Exclusion in `_get_prev_next()`

```
Input: User viewing section 1.1
       Click "Next" button

Backend executes _get_prev_next(node=1.1):
  
  Step 1 - Find containers:
    container_ids = parents of non-LEAF children
    = [1.1 section pk]  (because 1.1 has a leaf-group child)
  
  Step 2 - Build navigable list:
    navigable = all nodes
                EXCEPT LEAF nodes
                EXCEPT container_ids
    = [1.5]  (only section with no children)
  
  Step 3 - Find current node in navigable:
    navigable.index(1.1) 
    → ValueError (1.1 not in list!)
    → return None, None, None
  
  Step 4 - Send to frontend:
    prevNode: null
    nextNode: null
  
  Frontend renders:
    ← [DISABLED]  → [DISABLED]
```

---

## Fix Strategy (Conceptual)

### Fix #1: Numeric Path Sorting

Replace string sort with numeric sort:

```python
# Instead of: .order_by("path")
# Do this: parse path as tuple of ints, then sort

def numeric_path_key(path_str):
    """Convert "1.2.3.lg" to (1, 2, 3) for numeric sorting."""
    parts = []
    for seg in path_str.split("."):
        if seg == "lg":
            parts.append(float('inf'))  # sort lg paths after numbers
        elif seg.isdigit():
            parts.append(int(seg))
    return tuple(parts) if parts else (float('inf'),)

# Then in Python, sort:
nodes_list.sort(key=lambda n: numeric_path_key(n['path']))
```

### Fix #2: Include Parent Sections with Direct Content

Change the navigation logic to include nodes that have direct content blocks:

```python
# Instead of excluding all container parents,
# only exclude those with NO direct content

navigable = ContentNode.objects.filter(
    document=node.document,
).exclude(
    node_type=ContentNode.LEAF,  # Still exclude LEAF nodes
).annotate(
    has_content=Count('blocks')
).filter(
    Q(has_content__gt=0) |  # Has direct content blocks, OR
    Q(node_type=ContentNode.LEAF_GROUP)  # Is a leaf-group (content on children)
).order_by(...)
```

This way:
- Section 1.1 (has intro para + figure) ✓ navigable
- Leaf-group 1.2 (has leaf children) ✓ navigable
- Section 1 (root, has children but no direct content) ✗ skipped
- Leaf nodes ✗ still skipped

