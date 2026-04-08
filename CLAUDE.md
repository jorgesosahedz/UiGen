# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup       # Install deps + Prisma generate + migrate
npm run dev         # Start dev server (Turbopack)
npm run build       # Production build
npm run lint        # ESLint
npm run test        # Vitest
npm run db:reset    # Drop and recreate SQLite database
```

To run a single test file: `npx vitest run <path/to/test>`

## Environment

Create a `.env` file with:
```
ANTHROPIC_API_KEY=sk-...   # Optional — falls back to MockLanguageModel if absent
```

## Architecture

UIGen is a Next.js 15 app where users chat with Claude to generate React components that are instantly previewed in a sandboxed iframe.

### Data Flow

1. User sends a prompt in `ChatInterface` → `ChatContext` (using Vercel AI SDK `useChat`) POSTs to `/api/chat` with messages + serialized virtual file system state
2. `/api/chat` reconstructs the VirtualFileSystem, calls Claude with two tools: `str_replace_editor` (create/edit files) and `file_manager` (rename/delete)
3. Tool call results stream back to the client; `FileSystemContext` applies them to the in-memory `VirtualFileSystem`
4. `PreviewFrame` renders the virtual FS files in an iframe using Babel standalone for JSX transpilation at runtime
5. On stream completion, if the user is authenticated, the project is saved to SQLite via Prisma

### Key Abstractions

- **`VirtualFileSystem`** (`src/lib/file-system.ts`) — in-memory file tree with no disk I/O; serialized as JSON for persistence and passed to `/api/chat` on every request
- **`FileSystemContext`** (`src/lib/contexts/file-system-context.tsx`) — React context wrapping VirtualFileSystem; handles incoming tool calls from the AI stream
- **`ChatContext`** (`src/lib/contexts/chat-context.tsx`) — wraps `useChat`, injects file system state into each request
- **`jsx-transformer.ts`** (`src/lib/transform/jsx-transformer.ts`) — transforms VirtualFileSystem files into a self-contained HTML document with an import map for the preview iframe
- **`provider.ts`** (`src/lib/provider.ts`) — returns the Anthropic model or a `MockLanguageModel` when no API key is configured; mock returns hardcoded component sequences

### Auth

JWT sessions in HTTP-only cookies (7-day expiry, `jose`). Anonymous users can generate components; work is tracked in `localStorage` via `anon-work-tracker.ts` and migrated to a project on sign-in. `middleware.ts` protects `/[projectId]` routes.

### Layout

Three-panel resizable layout in `main-content.tsx`: Chat (35%) | File Tree (30% of right) | Code Editor / Preview (70% of right). The right panel toggles between Preview and Code views.

### Database

Prisma + SQLite. Two models: `User` and `Project`. `Project.messages` and `Project.data` are JSON strings storing chat history and VirtualFileSystem state respectively.

### AI Tools

Two tools are passed to Claude in `/api/chat/route.ts`:
- `str_replace_editor`: supports `view`, `create`, `str_replace`, and `insert` commands
- `file_manager`: supports `rename` and `delete` commands

The system prompt lives in `src/lib/prompts/generation.tsx` and uses Anthropic prompt caching (`cacheControl: { type: "ephemeral" }`).
