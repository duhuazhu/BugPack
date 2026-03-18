---
name: bugpack
description: "BugPack - AI-powered bug tracking and fixing toolkit. List bugs, view bug details with screenshots, and fix bugs automatically. Includes three workflows: list-bugs, view-bug, fix-bug. Requires BugPack server running locally."
metadata:
  openclaw:
    emoji: "\U0001F4E6"
---

# BugPack

AI-powered bug tracking and fixing toolkit. List, view, and fix bugs from BugPack.

## Prerequisites

Start BugPack server first:

```bash
npx bugpack-mcp
```

## Skill 1: List Bugs

Query all tracked bugs with optional filtering.

### Instructions

1. Call `GET http://localhost:3456/api/bugs` to fetch all bugs.
   - Optional: `?project_id=<id>` to filter by project.
2. Each bug has: `id`, `title`, `description`, `status`, `priority`, `project_id`, `created_at`.
3. Present results grouped by status (`pending` / `fixed` / `closed`).

### Example

```
GET http://localhost:3456/api/bugs
```

---

## Skill 2: View Bug Details

Fetch full bug context including screenshots, environment, and related files.

### Instructions

1. Call `GET http://localhost:3456/api/bugs/:id` for full details.
2. Response includes: `title`, `description`, `status`, `priority`, `pagePath`, `device`, `browser`, `relatedFiles`, `screenshots`.
3. Use `relatedFiles` to locate relevant source code.
4. Screenshots have `original_path` and `annotated_path`.

### Example

```
GET http://localhost:3456/api/bugs/abc-123
```

---

## Skill 3: Fix Bug

Read bug context, locate code, apply fix, and update status.

### Instructions

1. **Get context**: `GET http://localhost:3456/api/bugs/:id`
2. **Analyze**: Read description and examine screenshots.
3. **Locate code**: Use `relatedFiles` or search by `pagePath` and `description`.
4. **Apply fix**: Edit source code following project conventions.
5. **Mark fixed**: `PATCH http://localhost:3456/api/bugs/:id` with `{ "status": "fixed" }`
6. **Add note** (optional): Update description to document what was changed.

### Example

```bash
# Get bug context
GET http://localhost:3456/api/bugs/abc-123

# Mark as fixed
PATCH http://localhost:3456/api/bugs/abc-123
Content-Type: application/json

{ "status": "fixed" }
```
