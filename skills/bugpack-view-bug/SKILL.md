---
name: bugpack-view-bug
description: "View detailed bug context from BugPack including screenshots, environment info, and related files. Use when: user wants to see bug details, screenshots, or understand a specific bug before fixing. NOT for: listing all bugs (use bugpack-list-bugs) or directly fixing bugs (use bugpack-fix-bug)."
metadata:
  openclaw:
    emoji: "\U0001F50D"
---

# BugPack - View Bug Details

Fetch full bug context from BugPack, including description, screenshots, environment info, and related files.

## Instructions

1. Call `GET http://localhost:3456/api/bugs/:id` to get the full bug details.
2. The response includes:
   - `title`, `description`, `status`, `priority`
   - `pagePath` — the page/route where the bug occurs
   - `device`, `browser` — environment info
   - `relatedFiles` — array of file paths related to the bug
   - `screenshots` — array of screenshot objects with `id`, `name`, `original_path`, `annotated_path`
3. Display the bug info in a structured format.
4. If the bug has screenshots, mention them and offer to show annotated versions.
5. If `relatedFiles` are listed, use them to locate relevant source code.

## Example

```
GET http://localhost:3456/api/bugs/abc-123
```

Response:

```json
{
  "ok": true,
  "data": {
    "id": "abc-123",
    "title": "Button click not working",
    "description": "The submit button on the login page does not respond to clicks",
    "status": "open",
    "priority": "high",
    "pagePath": "/login",
    "device": "Desktop",
    "browser": "Chrome 120",
    "relatedFiles": ["src/pages/Login.tsx", "src/components/SubmitButton.tsx"],
    "screenshots": [
      {
        "id": "ss-001",
        "name": "login-bug.png",
        "original_path": "/uploads/MyProject/original.png",
        "annotated_path": "/uploads/MyProject/annotated.png"
      }
    ]
  }
}
```
