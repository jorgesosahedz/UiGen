 # CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

UIGen is an AI-powered React component generator with live preview. The user describes a component in chat; Claude generates the code by calling file-editing tools against an **in-memory virtual file system** (nothing is written to disk), and the result is transpiled and rendered live in a sandboxed iframe.

## Commands

```bash
npm run setup      # install deps + prisma generate + prisma migrate dev (run first)
npm run dev        # dev server on http://localhost:3000 (Turbopack)
npm run dev:daemon # dev server in background, logs to logs.txt
npm run build
npm run start
npm run lint
npm test                              # run the full vitest suite
npx vitest run src/lib/__tests__/file-system.test.ts   # single test file
npx vitest run -t "creates a file"    # single test by name
npm run db:reset   # prisma migrate reset --force
```

The app runs **without** an `ANTHROPIC_API_KEY` — `getLanguageModel()` in `src/lib/provider.ts` falls back to `MockLanguageModel`, which returns a canned counter/form/card component instead of calling Claude. Set the key in `.env` to use the real model (`claude-haiku-4-5`).

### Windows note

The npm scripts use bash-style inline env vars (`NODE_OPTIONS='...' next dev`) which fail in cmd/PowerShell. To run on Windows, set the env var separately first: `$env:NODE_OPTIONS='--require ./node-compat.cjs'; npx next dev --turbopack`. `node-compat.cjs` deletes the global `localStorage`/`sessionStorage` that Node 25+ exposes, which otherwise breaks SSR guard checks.

## Architecture

### Virtual file system (the core abstraction)

`src/lib/file-system.ts` — `VirtualFileSystem` is an in-memory tree (a flat `Map<path, FileNode>` plus a root node). It backs everything: the editor, the preview, and the AI's file operations. There are no real files on disk for generated components. Key methods: `serialize()`/`deserializeFromNodes()` (persistence + passing state to the API), and the text-editor command helpers (`viewFile`, `createFileWithParents`, `replaceInFile`, `insertInFile`) that the AI tools call directly.

The same data flows through two layers that **must stay in sync**:
- **Server**: `src/app/api/chat/route.ts` reconstructs a fresh `VirtualFileSystem` from the serialized files in the request, runs the AI with the tools bound to it, then persists the result.
- **Client**: `FileSystemProvider` (`src/lib/contexts/file-system-context.tsx`) holds the canonical client-side instance. Its `handleToolCall` mirrors each AI tool call into the client FS so the UI updates live as the stream arrives.

### AI tools

The model is given two tools, both built as closures over a `VirtualFileSystem` instance:
- `str_replace_editor` (`src/lib/tools/str-replace.ts`) — `view`/`create`/`str_replace`/`insert` text-editor commands.
- `file_manager` (`src/lib/tools/file-manager.ts`) — `rename`/`delete`.

The system prompt lives in `src/lib/prompts/generation.tsx`. Important conventions it enforces: every project has a root `/App.jsx` default export as the entry point; styling is Tailwind only; non-library imports use the `@/` alias.

### Chat flow

`ChatProvider` (`src/lib/contexts/chat-context.tsx`) wraps the Vercel AI SDK's `useChat`, POSTs to `/api/chat` with the serialized FS + `projectId`, and routes `onToolCall` into the file-system context. On the server, `onFinish` persists `messages` and the serialized FS to the `Project.data`/`Project.messages` columns (only for authenticated users with a `projectId`).

### Preview pipeline

`src/lib/transform/jsx-transformer.ts` is the heart of the preview. It uses `@babel/standalone` to transpile JSX/TS in the browser, builds an **import map** that resolves `@/` aliases and bare specifiers to `https://esm.sh/...` CDN URLs, turns each transpiled module into a blob URL, generates placeholder modules for missing imports, and assembles a full HTML document (with Tailwind CDN + an error boundary). `PreviewFrame.tsx` injects this via `iframe.srcdoc` with a `sandbox` attribute. The iframe re-renders whenever the FS context's `refreshTrigger` increments.

### Persistence & auth

- Prisma + SQLite (`prisma/schema.prisma`). The generated client is committed to `src/generated/prisma` (note the custom `output` path — import Prisma from there, not `@prisma/client` directly; see `src/lib/prisma.ts`).
- A `Project` stores `messages` and `data` (the serialized FS) as JSON **strings**. `userId` is nullable.
- Auth is custom JWT-in-an-httpOnly-cookie via `jose` (`src/lib/auth.ts`); `src/middleware.ts` guards API routes. Server actions live in `src/actions/`.
- **Anonymous users**: work is held in `sessionStorage` via `src/lib/anon-work-tracker.ts`. On sign-in/sign-up the tracked work is converted into a real `Project` (see `src/components/auth/` and the post-auth flow). `src/app/page.tsx` redirects authenticated users to their most recent project, creating one if none exists.

## Database

The database schema is defined in `src/generated/prisma/schema.prisma`. Reference it any time you need to understand the structure of data stored in the database.

## Code style

Use comments sparingly. Only comment complex code.

## Testing

Vitest with jsdom and `@testing-library/react` (config in `vitest.config.mts`, which wires up `vite-tsconfig-paths` so the `@/` alias resolves). Tests live in `__tests__/` directories next to the code they cover.