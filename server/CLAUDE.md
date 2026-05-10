# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

**revealNotesServer** is the backend for a browser-extension/web project that lets students attach Twitter-style community notes to any URL. Users must create an account (student email login is planned but not enforced yet). The server exposes a REST API consumed by a browser extension frontend.

## Stack

- **Runtime**: Bun
- **Framework**: Hono with `@hono/zod-openapi` (routes are declared with Zod schemas that auto-generate the OpenAPI spec)
- **Database**: SQLite via Drizzle ORM (`drizzle-orm/bun-sqlite`)
- **Auth**: JWT (`hono/jwt`) + bcrypt for password hashing
- **Docs UI**: `@hono/swagger-ui` served at `/docs`, raw spec at `/openapi.json`
- **Testing**: Bun's built-in test runner

## Commands

```bash
bun install          # install deps
bun run dev          # start server with --watch (hot reload)
bun run start        # production start
bun test             # run all tests
bun test <file>      # run a single test file, e.g. bun test src/routes/notes.test.ts
bun run db:migrate   # apply Drizzle migrations
bun run db:studio    # open Drizzle Studio (DB GUI)
bun run db:generate  # generate migration files from schema changes
```

## Architecture

```
src/
  index.ts           # app entry: mounts all routers, starts Bun.serve
  db/
    schema.ts        # Drizzle table definitions (users, notes, votes)
    client.ts        # singleton DB connection
    migrations/      # auto-generated SQL migrations
  routes/
    auth.ts          # POST /auth/register, POST /auth/login, POST /auth/logout
    notes.ts         # GET /notes?url=, POST /notes, DELETE /notes/:id
    votes.ts         # POST /notes/:id/vote, DELETE /notes/:id/vote
  middleware/
    auth.ts          # JWT verification middleware; attaches ctx.var.user
  lib/
    openapi.ts       # shared OpenAPIHono app instance + tag definitions
  types.ts           # shared Zod schemas (reused in routes + tests)
tests/
  helpers.ts         # test DB setup/teardown, authenticated fetch helper
  auth.test.ts
  notes.test.ts
  votes.test.ts
```

### Data model (schema.ts)

- **users**: `id`, `email`, `passwordHash`, `createdAt`
- **notes**: `id`, `url` (the page URL), `authorId`, `body`, `createdAt`
- **votes**: `id`, `noteId`, `userId`, `value` (+1/-1), unique on `(noteId, userId)`

Notes are fetched by exact `url` match. The aggregated vote score is computed in-query (sum of `votes.value`).

### OpenAPI-first design

Every route is defined via `app.openapi(route, handler)` where `route` is a `createRoute(...)` descriptor containing Zod schemas for params, query, body, and all response shapes. This means:

- `/openapi.json` is always the authoritative contract — no manual docs to maintain.
- A frontend Claude agent should fetch `/openapi.json` first to understand all available endpoints before making calls.
- Tests import the same Zod schemas from `src/types.ts` to avoid drift.

### Auth flow

1. `POST /auth/register` — hash password with bcrypt, insert user, return JWT.
2. `POST /auth/login` — verify password, return JWT.
3. Protected routes use the `authMiddleware` which validates the `Authorization: Bearer <token>` header and sets `ctx.var.user`.
4. Student email enforcement is **not implemented yet** — any email is accepted. The check will go in the register handler when added.

## Testing approach

- Each test file creates an in-memory SQLite DB via `helpers.ts` and tears it down after.
- `helpers.ts` exports a `makeApp()` that wires up the full Hono app against the test DB.
- Tests exercise the full HTTP stack (no mocking of DB or middleware) using `app.request(...)`.
- Aim: every route has at least one happy-path test and one auth-failure test.

## Frontend agent documentation notes

The `/docs` Swagger UI and `/openapi.json` spec are the primary documentation surface for the browser-extension frontend agent. When adding or modifying routes:
- Always declare descriptions on `createRoute(...)` so they appear in the spec.
- Include example values in Zod schemas using `.openapi({ example: ... })`.
- Response schemas must cover error shapes (401, 404, 422) so the frontend agent handles them correctly.
