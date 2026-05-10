import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { eq, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { notes, votes, users } from "../db/schema";
import { authMiddleware, type AuthVariables } from "../middleware/auth";
import { NoteBody, NoteOut, ErrorResponse } from "../types";

const getNotesRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["notes"],
  summary: "Get all notes for a URL",
  request: {
    query: z.object({
      url: z.string().url().openapi({ example: "https://example.com/article" }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(NoteOut) } },
      description: "List of notes with aggregated vote scores",
    },
    422: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Invalid query parameters",
    },
  },
});

const createNoteRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["notes"],
  summary: "Create a note for a URL",
  request: {
    body: { content: { "application/json": { schema: NoteBody } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: NoteOut } },
      description: "Note created",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Not authenticated",
    },
    422: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Invalid request body",
    },
  },
});

const deleteNoteRoute = createRoute({
  method: "delete",
  path: "/:id",
  tags: ["notes"],
  summary: "Delete a note (author only)",
  request: {
    params: z.object({
      id: z.coerce.number().int().openapi({ example: 1 }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ ok: z.boolean() }) },
      },
      description: "Note deleted",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Not authenticated",
    },
    403: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Not the author",
    },
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Note not found",
    },
  },
});

async function fetchNoteWithScore(db: DB, noteId: number) {
  const rows = await db
    .select({
      id: notes.id,
      url: notes.url,
      body: notes.body,
      authorId: notes.authorId,
      authorEmail: users.email,
      createdAt: notes.createdAt,
      score: sql<number>`coalesce(sum(${votes.value}), 0)`.as("score"),
    })
    .from(notes)
    .innerJoin(users, eq(users.id, notes.authorId))
    .leftJoin(votes, eq(votes.noteId, notes.id))
    .where(eq(notes.id, noteId))
    .groupBy(notes.id);
  return rows[0] ?? null;
}

export function notesRouter(db: DB) {
  const router = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "Validation failed" }, 422);
    },
  });

  const mw = authMiddleware(db);
  router.use("/", async (c, next) => {
    if (c.req.method === "POST") return mw(c, next);
    return next();
  });
  router.use("/:id", mw);

  router.openapi(getNotesRoute, async (c) => {
    const { url } = c.req.valid("query");
    const rows = await db
      .select({
        id: notes.id,
        url: notes.url,
        body: notes.body,
        authorId: notes.authorId,
        authorEmail: users.email,
        createdAt: notes.createdAt,
        score: sql<number>`coalesce(sum(${votes.value}), 0)`.as("score"),
      })
      .from(notes)
      .innerJoin(users, eq(users.id, notes.authorId))
      .leftJoin(votes, eq(votes.noteId, notes.id))
      .where(eq(notes.url, url))
      .groupBy(notes.id);

    return c.json(
      rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      200
    );
  });

  router.openapi(createNoteRoute, async (c) => {
    const user = c.var.user;
    const { url, body } = c.req.valid("json");

    const inserted = await db
      .insert(notes)
      .values({ url, body, authorId: user.id })
      .returning();
    const note = inserted[0]!;

    const full = await fetchNoteWithScore(db, note.id);
    return c.json({ ...full!, createdAt: full!.createdAt.toISOString() }, 201);
  });

  router.openapi(deleteNoteRoute, async (c) => {
    const user = c.var.user;
    const { id } = c.req.valid("param");

    const note = await db.query.notes.findFirst({ where: eq(notes.id, id) });
    if (!note) return c.json({ error: "Note not found" }, 404);
    if (note.authorId !== user.id) return c.json({ error: "Forbidden" }, 403);

    await db.delete(notes).where(eq(notes.id, id));
    return c.json({ ok: true }, 200);
  });

  return router;
}
