---
name: Project context
description: revealNotesServer stack, purpose, and deployment target
type: project
---

Community notes backend for browser extension. Students attach Twitter-style notes to any URL.

Stack: Bun + Hono + Drizzle ORM (SQLite) + JWT auth with revoked-token table.

Deployment target: user's own server, accessible via SSH alias "dg".

**Why:** User controls the server and will deploy there directly.
**How to apply:** When suggesting deployment commands, assume `ssh dg` reaches the server. Prefer simple systemd or process-manager setups over containerized ones unless asked.
