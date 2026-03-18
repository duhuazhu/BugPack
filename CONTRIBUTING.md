# Contributing

Thanks for your interest in BugPack!

## Using BugPack

If you just want to use BugPack, no need to clone — run it directly via npm:

```bash
# Start Web UI
npx bugpack-mcp

# Start MCP Server (for AI coding tools)
npx bugpack-mcp --mcp
```

## Contributing Code

To contribute code to BugPack:

1. Fork and clone the repository
2. `npm install`
3. `npm run dev:all` to start dev mode (frontend + backend with hot reload)
4. Develop on a `feature/xxx` branch
5. Submit a PR

## Dev Commands

| Command | Description |
|---------|-------------|
| `npm run dev:all` | Start frontend + backend (dev mode) |
| `npm run build` | Production build |

## Project Structure

```
src/
├── client/                # React frontend
│   ├── components/        # UI components
│   ├── stores/            # Zustand state management
│   ├── hooks/             # Custom hooks
│   ├── i18n/              # Internationalization (zh/en)
│   └── utils/             # Utilities (instruction generation)
├── server/                # Express backend
│   ├── routes/            # API routes
│   └── db.ts              # SQLite database
└── mcp/                   # MCP Server (stdio transport)
```

## Guidelines

- Ensure `npx tsc --noEmit` passes before submitting
- Update i18n files in `src/client/i18n/` for both zh and en if applicable
