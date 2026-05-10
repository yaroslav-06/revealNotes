import { describe, test, expect, beforeEach } from "bun:test";
import { makeTestApp, post } from "./helpers";
import type { createApp } from "../src/app";

type AuthBody = { token: string; user: { id: number; email: string } };
type NoteBody = {
  id: number;
  url: string;
  body: string;
  authorId: number;
  authorEmail: string;
  createdAt: string;
  score: number;
};
type ErrBody = { error: string };

const URL_A = "https://example.com/article";
const URL_B = "https://other.com/page";
const USER_A = { email: "alice@uni.edu", password: "alicepassword" };
const USER_B = { email: "bob@uni.edu", password: "bobpassword" };

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

// ---------------------------------------------------------------------------
describe("GET /notes", () => {
  test("200 — empty list when no notes exist for URL", async () => {
    const res = await app.request(`/notes?url=${encodeURIComponent(URL_A)}`);
    expect(res.status).toBe(200);
    const body = await res.json() as NoteBody[];
    expect(body).toEqual([]);
  });

  test("200 — returns notes only for the queried URL", async () => {
    const { token } = await register();
    await authedPost("/notes", token, { url: URL_A, body: "Note on A" });
    await authedPost("/notes", token, { url: URL_B, body: "Note on B" });

    const res = await app.request(`/notes?url=${encodeURIComponent(URL_A)}`);
    expect(res.status).toBe(200);
    const notes = await res.json() as NoteBody[];
    expect(notes).toHaveLength(1);
    expect(notes[0]!.url).toBe(URL_A);
    expect(notes[0]!.body).toBe("Note on A");
  });

  test("200 — note shape includes all required fields", async () => {
    const { token, user } = await register();
    await authedPost("/notes", token, { url: URL_A, body: "Shape check" });

    const res = await app.request(`/notes?url=${encodeURIComponent(URL_A)}`);
    const notes = await res.json() as NoteBody[];
    const note = notes[0]!;

    expect(typeof note.id).toBe("number");
    expect(note.url).toBe(URL_A);
    expect(note.body).toBe("Shape check");
    expect(note.authorId).toBe(user.id);
    expect(note.authorEmail).toBe(USER_A.email);
    expect(typeof note.createdAt).toBe("string");
    expect(note.score).toBe(0);
  });

  test("200 — multiple notes from different authors for same URL", async () => {
    const { token: tokA } = await register(USER_A);
    const { token: tokB } = await register(USER_B);
    await authedPost("/notes", tokA, { url: URL_A, body: "Alice's note" });
    await authedPost("/notes", tokB, { url: URL_A, body: "Bob's note" });

    const res = await app.request(`/notes?url=${encodeURIComponent(URL_A)}`);
    const notes = await res.json() as NoteBody[];
    expect(notes).toHaveLength(2);
  });

  test("200 — public access (no auth required)", async () => {
    const res = await app.request(`/notes?url=${encodeURIComponent(URL_A)}`);
    expect(res.status).toBe(200);
  });

  test("422 — missing url query param", async () => {
    const res = await app.request("/notes");
    expect(res.status).toBe(422);
  });

  test("422 — invalid url format", async () => {
    const res = await app.request("/notes?url=not-a-url");
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
describe("POST /notes", () => {
  test("201 — creates note and returns it with score 0", async () => {
    const { token, user } = await register();
    const res = await authedPost("/notes", token, { url: URL_A, body: "My note" });
    expect(res.status).toBe(201);
    const note = await res.json() as NoteBody;
    expect(note.url).toBe(URL_A);
    expect(note.body).toBe("My note");
    expect(note.authorId).toBe(user.id);
    expect(note.authorEmail).toBe(USER_A.email);
    expect(note.score).toBe(0);
    expect(note.id).toBeGreaterThan(0);
  });

  test("401 — no token", async () => {
    const res = await post(app, "/notes", { url: URL_A, body: "My note" });
    expect(res.status).toBe(401);
  });

  test("401 — malformed token", async () => {
    const res = await app.request("/notes", {
      method: "POST",
      headers: {
        Authorization: "Bearer not.a.token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: URL_A, body: "My note" }),
    });
    expect(res.status).toBe(401);
  });

  test("422 — missing url", async () => {
    const { token } = await register();
    const res = await authedPost("/notes", token, { body: "No URL" });
    expect(res.status).toBe(422);
  });

  test("422 — invalid url format", async () => {
    const { token } = await register();
    const res = await authedPost("/notes", token, { url: "not-a-url", body: "Bad URL" });
    expect(res.status).toBe(422);
  });

  test("422 — empty body", async () => {
    const { token } = await register();
    const res = await authedPost("/notes", token, { url: URL_A, body: "" });
    expect(res.status).toBe(422);
  });

  test("422 — body over 500 chars", async () => {
    const { token } = await register();
    const res = await authedPost("/notes", token, { url: URL_A, body: "x".repeat(501) });
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
describe("DELETE /notes/:id", () => {
  test("200 — author can delete their own note", async () => {
    const { token } = await register();
    const created = await (await authedPost("/notes", token, { url: URL_A, body: "Delete me" })).json() as NoteBody;
    const res = await authedDelete(`/notes/${created.id}`, token);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("note is actually removed after delete", async () => {
    const { token } = await register();
    const created = await (await authedPost("/notes", token, { url: URL_A, body: "Gone" })).json() as NoteBody;
    await authedDelete(`/notes/${created.id}`, token);

    const res = await app.request(`/notes?url=${encodeURIComponent(URL_A)}`);
    const notes = await res.json() as NoteBody[];
    expect(notes).toHaveLength(0);
  });

  test("403 — non-author cannot delete note", async () => {
    const { token: tokA } = await register(USER_A);
    const { token: tokB } = await register(USER_B);
    const created = await (await authedPost("/notes", tokA, { url: URL_A, body: "Alice's" })).json() as NoteBody;

    const res = await authedDelete(`/notes/${created.id}`, tokB);
    expect(res.status).toBe(403);
    const body = await res.json() as ErrBody;
    expect(body.error).toBe("Forbidden");
  });

  test("404 — note does not exist", async () => {
    const { token } = await register();
    const res = await authedDelete("/notes/99999", token);
    expect(res.status).toBe(404);
    const body = await res.json() as ErrBody;
    expect(body.error).toBe("Note not found");
  });

  test("401 — no token", async () => {
    const { token } = await register();
    const created = await (await authedPost("/notes", token, { url: URL_A, body: "Secure" })).json() as NoteBody;
    const res = await app.request(`/notes/${created.id}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});
