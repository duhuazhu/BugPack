---
name: bugpack-fix-bug
description: "Fix a bug from BugPack by reading its context, locating code, applying fixes, and updating status. Use when: user asks to fix, repair, or resolve a bug. NOT for: just listing bugs (use bugpack-list-bugs) or just viewing bug details (use bugpack-view-bug)."
metadata:
  openclaw:
    emoji: "\U0001F527"
---

# BugPack - Fix Bug

Read bug context from BugPack, locate the relevant code, apply a fix, and mark the bug as fixed.

## Instructions

1. **Get bug context**: Call `GET http://localhost:3456/api/bugs/:id` to fetch full bug details including description, screenshots, environment, and related files.

2. **Analyze the bug**: Read the description and examine the screenshots to understand what is broken and what the expected behavior should be.

3. **Locate code**: Use the `relatedFiles` array from the bug context to find the relevant source files. If `relatedFiles` is empty, use the `pagePath` and `description` to search the codebase.

4. **Apply fix**: Edit the source code to fix the described issue. Follow the project's existing code style and conventions.

5. **Mark as fixed**: After applying the fix, call `PATCH http://localhost:3456/api/bugs/:id` with:
   ```json
   { "status": "fixed" }
   ```

6. **Add fix note** (optional): Call `PATCH http://localhost:3456/api/bugs/:id` with a description update to document what was changed.

## Example

```bash
# Step 1: Get bug context
GET http://localhost:3456/api/bugs/abc-123

# Step 5: Mark as fixed
PATCH http://localhost:3456/api/bugs/abc-123
Content-Type: application/json

{ "status": "fixed" }
```

Response:

```json
{
  "ok": true,
  "data": {
    "id": "abc-123",
    "status": "fixed"
  }
}
```
