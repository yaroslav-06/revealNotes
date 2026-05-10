import { describe, test, expect, beforeEach } from "bun:test";
import { makeTestApp, post } from "./helpers";
import type { createApp } from "../src/app";

type AuthBody = { token: string; user: { id: number; email: string } };
type NoteBody = { id: number; score: number; [k: string]: unknown };
type VoteBody = { noteId: number; value: number };
type ErrBody = { error: string };

const URL_A = "https://example.com/article";
const USER_A = { email: "alice@uni.edu", password: "alicepassword" };
const USER_B = { email: "bob@uni.edu", password: "bobpassword" };
const USER_C = { email: "carol@uni.edu", password: "carolpassword" };

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  ({ app } = makeTestApp());
});

async function register(creds = USER_A): Promise<AuthBody> {
  const res = await post(app, "/auth/register", creds);
  return res.json() as Promise<AuthBody>;
}

async function authedPost(path: string, token: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function authedDelete(path: string, token: string) {
  return app.request(path, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function createNote(token: string): Promise<NoteBody> {
  const res = await authedPost("/notes", token, { url: URL_A, body: "Test note" });
  return res.json() as Promise<NoteBody>;
}

async function getScore(noteId: number): Promise<number> {
  const res = await app.request(`/notes?url=${encodeURIComponent(URL_A)}`);
  const notes = await res.json() as NoteBody[];
  return notes.find((n) => n.id === noteId)?.score ?? 0;
}

// ---------------------------------------------------------------------------
describe("POST /notes/:id/vote", () => {
  test("200 — upvote returns correct shape", async () => {
    const { token } = await register();
    const note = await createNote(token);
    const { token: tokB } = await register(USER_B);

    const res = await authedPost(`/notes/${note.id}/vote`, tokB, { value: 1 });
    expect(res.status).toBe(200);
    const body = await res.json() as VoteBody;
    expect(body.noteId).toBe(note.id);
    expect(body.value).toBe(1);
  });

  test("200 — downvote", async () => {
    const { token } = await register();
    const note = await createNote(token);
    const { token: tokB } = await register(USER_B);

    const res = await authedPost(`/notes/${note.id}/vote`, tokB, { value: -1 });
    expect(res.status).toBe(200);
    const body = await res.json() as VoteBody;
    expect(body.value).toBe(-1);
  });

  test("score increases by 1 after upvote", async () => {
    const { token } = await register();
    const note = await createNote(token);
    const { token: tokB } = await register(USER_B);

    await authedPost(`/notes/${note.id}/vote`, tokB, { value: 1 });
    expect(await getScore(note.id)).toBe(1);
  });

  test("score decreases by 1 after downvote", async () => {
    const { token } = await register();
    const note = await createNote(token);
    const { token: tokB } = await register(USER_B);

    await authedPost(`/notes/${note.id}/vote`, tokB, { value: -1 });
    expect(await getScore(note.id)).toBe(-1);
  });

  test("multiple voters accumulate score correctly", async () => {
    const { token: tokA } = await register(USER_A);
    const note = await createNote(tokA);
    const { token: tokB } = await register(USER_B);
    const { token: tokC } = await register(USER_C);

    await authedPost(`/notes/${note.id}/vote`, tokB, { value: 1 });
    await authedPost(`/notes/${note.id}/vote`, tokC, { value: 1 });
    expect(await getScore(note.id)).toBe(2);
  });

  test("mixed votes produce correct net score", async () => {
    const { token: tokA } = await register(USER_A);
    const note = await createNote(tokA);
    const { token: tokB } = await register(USER_B);
    const { token: tokC } = await register(USER_C);

    await authedPost(`/notes/${note.id}/vote`, tokB, { value: 1 });
    await authedPost(`/notes/${note.id}/vote`, tokC, { value: -1 });
    expect(await getScore(note.id)).toBe(0);
  });

  test("voting twice updates the existing vote (upsert)", async () => {
    const { token: tokA } = await register(USER_A);
    const note = await createNote(tokA);
    const { token: tokB } = await register(USER_B);

    await authedPost(`/notes/${note.id}/vote`, tokB, { value: 1 });
    await authedPost(`/notes/${note.id}/vote`, tokB, { value: -1 });
    expect(await getScore(note.id)).toBe(-1);
  });

  test("vote flip from -1 to +1", async () => {
    const { token: tokA } = await register(USER_A);
    const note = await createNote(tokA);
    const { token: tokB } = await register(USER_B);

    await authedPost(`/notes/${note.id}/vote`, tokB, { value: -1 });
    await authedPost(`/notes/${note.id}/vote`, tokB, { value: 1 });
    expect(await getScore(note.id)).toBe(1);
  });

  test("author can vote on their own note", async () => {
    const { token } = await register();
    const note = await createNote(token);

    const res = await authedPost(`/notes/${note.id}/vote`, token, { value: 1 });
    expect(res.status).toBe(200);
    expect(await getScore(note.id)).toBe(1);
  });

  test("401 — no token", async () => {
    const { token } = await register();
    const note = await createNote(token);
    const res = await post(app, `/notes/${note.id}/vote`, { value: 1 });
    expect(res.status).toBe(401);
  });

  test("404 — note does not exist", async () => {
    const { token } = await register();
    const res = await authedPost("/notes/99999/vote", token, { value: 1 });
    expect(res.status).toBe(404);
    const body = await res.json() as ErrBody;
    expect(body.error).toBe("Note not found");
  });

  test("422 — invalid value (not 1 or -1)", async () => {
    const { token: tokA } = await register(USER_A);
    const note = await createNote(tokA);
    const { token: tokB } = await register(USER_B);

    const res = await authedPost(`/notes/${note.id}/vote`, tokB, { value: 0 });
    expect(res.status).toBe(422);
  });

  test("422 — missing value", async () => {
    const { token: tokA } = await register(USER_A);
    const note = await createNote(tokA);
    const { token: tokB } = await register(USER_B);

    const res = await authedPost(`/notes/${note.id}/vote`, tokB, {});
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
describe("DELETE /notes/:id/vote", () => {
  test("200 — removes vote successfully", async () => {
    const { token: tokA } = await register(USER_A);
    const note = await createNote(tokA);
    const { token: tokB } = await register(USER_B);

    await authedPost(`/notes/${note.id}/vote`, tokB, { value: 1 });
    const res = await authedDelete(`/notes/${note.id}/vote`, tokB);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("score goes back to 0 after removing the only vote", async () => {
    const { token: tokA } = await register(USER_A);
    const note = await createNote(tokA);
    const { token: tokB } = await register(USER_B);

    await authedPost(`/notes/${note.id}/vote`, tokB, { value: 1 });
    await authedDelete(`/notes/${note.id}/vote`, tokB);
    expect(await getScore(note.id)).toBe(0);
  });

  test("removing one vote does not affect others", async () => {
    const { token: tokA } = await register(USER_A);
    const note = await createNote(tokA);
    const { token: tokB } = await register(USER_B);
    const { token: tokC } = await register(USER_C);

    await authedPost(`/notes/${note.id}/vote`, tokB, { value: 1 });
    await authedPost(`/notes/${note.id}/vote`, tokC, { value: 1 });
    await authedDelete(`/notes/${note.id}/vote`, tokB);
    expect(await getScore(note.id)).toBe(1);
  });

  test("401 — no token", async () => {
    const { token } = await register();
    const note = await createNote(token);
    const res = await app.request(`/notes/${note.id}/vote`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  test("404 — note does not exist", async () => {
    const { token } = await register();
    const res = await authedDelete("/notes/99999/vote", token);
    expect(res.status).toBe(404);
  });

  test("404 — user has no vote on this note", async () => {
    const { token: tokA } = await register(USER_A);
    const note = await createNote(tokA);
    const { token: tokB } = await register(USER_B);

    const res = await authedDelete(`/notes/${note.id}/vote`, tokB);
    expect(res.status).toBe(404);
    const body = await res.json() as ErrBody;
    expect(body.error).toBe("Vote not found");
  });
});
