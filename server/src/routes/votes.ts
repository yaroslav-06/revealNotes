import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { notes, votes } from "../db/schema";
import { authMiddleware, type AuthVariables } from "../middleware/auth";
import { VoteBody, VoteOut, ErrorResponse } from "../types";

const castVoteRoute = createRoute({
  method: "post",
  path: "/:id/vote",
  tags: ["votes"],
  summary: "Cast or update a vote on a note",
  request: {
    params: z.object({
      id: z.coerce.number().int().openapi({ example: 1 }),
    }),
    body: { content: { "application/json": { schema: VoteBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: VoteOut } },
      description: "Vote recorded",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Not authenticated",
    },
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Note not found",
    },
    422: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Invalid request body",
    },
  },
});

const removeVoteRoute = createRoute({
  method: "delete",
  path: "/:id/vote",
  tags: ["votes"],
  summary: "Remove your vote from a note",
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
      description: "Vote removed",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Not authenticated",
    },
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Note or vote not found",
    },
  },
});

export function votesRouter(db: DB) {
  const router = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "Validation failed" }, 422);
    },
  });

  const mw = authMiddleware(db);
  router.use("/:id/vote", mw);

  router.openapi(castVoteRoute, async (c) => {
    const user = c.var.user;
    const { id: noteId } = c.req.valid("param");
    const { value } = c.req.valid("json");

    const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
    if (!note) return c.json({ error: "Note not found" }, 404);

    await db
      .insert(votes)
      .values({ noteId, userId: user.id, value })
      .onConflictDoUpdate({
        target: [votes.noteId, votes.userId],
        set: { value },
      });

    return c.json({ noteId, value }, 200);
  });

  router.openapi(removeVoteRoute, async (c) => {
    const user = c.var.user;
    const { id: noteId } = c.req.valid("param");

    const note = await db.query.notes.findFirst({ where: eq(notes.id, noteId) });
    if (!note) return c.json({ error: "Note not found" }, 404);

    const deleted = await db
      .delete(votes)
      .where(and(eq(votes.noteId, noteId), eq(votes.userId, user.id)))
      .returning();

    if (deleted.length === 0) return c.json({ error: "Vote not found" }, 404);
    return c.json({ ok: true }, 200);
  });

  return router;
}
