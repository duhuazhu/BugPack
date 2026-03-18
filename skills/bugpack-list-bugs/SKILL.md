---
name: bugpack-list-bugs
description: "List all tracked bugs from BugPack with status and project filtering. Use when: user asks about bugs, pending issues, bug lists, or wants to see what needs fixing. NOT for: viewing detailed bug context (use bugpack-view-bug) or fixing bugs (use bugpack-fix-bug)."
metadata:
  openclaw:
    emoji: "\U0001F41B"
---

# BugPack - List Bugs

Query the BugPack local server to list all tracked bugs.

## Instructions

1. Call `GET http://localhost:3456/api/bugs` to fetch all bugs.
   - Optional query param: `?project_id=<id>` to filter by project.
2. Parse the JSON response. Each bug has: `id`, `title`, `description`, `status`, `priority`, `project_id`, `created_at`, `updated_at`.
3. Present the list in a readable table format, grouped by status (`open` / `fixed` / `closed`).
4. If no bugs are found, tell the user there are no tracked bugs.

## Example

```
GET http://localhost:3456/api/bugs
```

Response:

```json
{
  "ok": true,
  "data": [
    {
      "id": "abc-123",
      "title": "Button click not working",
      "status": "open",
      "priority": "high",
      "created_at": "2026-03-15T10:00:00Z"
    }
  ]
}
```
