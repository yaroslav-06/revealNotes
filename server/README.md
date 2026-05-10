# revealNotes Server

Backend for the revealNotes browser extension — a REST API that lets students attach community notes to any URL.

## Prerequisites

- [Bun](https://bun.sh) v1.0+

## Setup

```bash
bun install        # install dependencies
bun run db:migrate # create the SQLite database and apply migrations
```

## Running

```bash
bun run dev        # development mode with hot reload
bun run start      # production
```

The server starts on `http://localhost:3000` by default.

- API docs (Swagger UI): `http://localhost:3000/docs`
- OpenAPI spec: `http://localhost:3000/openapi.json`

## Other Commands

```bash
bun test           # run all tests
bun run db:studio  # open Drizzle Studio (DB GUI)
bun run db:generate # regenerate migrations after schema changes
```
