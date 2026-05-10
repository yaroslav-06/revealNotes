import { describe, test, expect, beforeEach } from "bun:test";
import { makeTestApp, post } from "./helpers";
import type { createApp } from "../src/app";

type AuthBody = { token: string; user: { id: number; email: string } };
type ErrBody = { error: string };

const VALID = { email: "student@uni.edu", password: "supersecret" };

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  ({ app } = makeTestApp());
});

async function register(credentials = VALID): Promise<AuthBody> {
  const res = await post(app, "/auth/register", credentials);
  return res.json() as Promise<AuthBody>;
}

async function authedGet(path: string, token: string) {
  return app.request(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function authedPost(path: string, token: string, body?: unknown) {
  return app.request(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
describe("POST /auth/register", () => {
  test("201 — creates user and returns token + user", async () => {
    const res = await post(app, "/auth/register", VALID);
    expect(res.status).toBe(201);
    const body = await res.json() as AuthBody;
    expect(typeof body.token).toBe("string");
    expect(body.user.email).toBe(VALID.email);
    expect(body.user.id).toBeGreaterThan(0);
    expect((body.user as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  test("409 — duplicate email", async () => {
    await register();
    const res = await post(app, "/auth/register", VALID);
    expect(res.status).toBe(409);
    const body = await res.json() as ErrBody;
    expect(body.error).toBe("Email already in use");
  });

  test("422 — missing password", async () => {
    const res = await post(app, "/auth/register", { email: VALID.email });
    expect(res.status).toBe(422);
  });

  test("422 — missing email", async () => {
    const res = await post(app, "/auth/register", { password: VALID.password });
    expect(res.status).toBe(422);
  });

  test("422 — invalid email format", async () => {
    const res = await post(app, "/auth/register", { email: "not-an-email", password: VALID.password });
    expect(res.status).toBe(422);
  });

  test("422 — password too short", async () => {
    const res = await post(app, "/auth/register", { email: VALID.email, password: "short" });
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
describe("POST /auth/login", () => {
  test("200 — valid credentials return token + user", async () => {
    await register();
    const res = await post(app, "/auth/login", VALID);
    expect(res.status).toBe(200);
    const body = await res.json() as AuthBody;
    expect(typeof body.token).toBe("string");
    expect(body.user.email).toBe(VALID.email);
  });

  test("401 — wrong password", async () => {
    await register();
    const res = await post(app, "/auth/login", { ...VALID, password: "wrongpassword" });
    expect(res.status).toBe(401);
    const body = await res.json() as ErrBody;
    expect(body.error).toBe("Invalid credentials");
  });

  test("401 — unknown email", async () => {
    const res = await post(app, "/auth/login", { email: "ghost@uni.edu", password: "somepassword" });
    expect(res.status).toBe(401);
    const body = await res.json() as ErrBody;
    expect(body.error).toBe("Invalid credentials");
  });

  test("422 — missing fields", async () => {
    const res = await post(app, "/auth/login", {});
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
describe("GET /auth/me", () => {
  test("200 — returns current user", async () => {
    const { token, user } = await register();
    const res = await authedGet("/auth/me", token);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: number; email: string };
    expect(body.id).toBe(user.id);
    expect(body.email).toBe(user.email);
  });

  test("401 — no token", async () => {
    const res = await app.request("/auth/me");
    expect(res.status).toBe(401);
  });

  test("401 — malformed token", async () => {
    const res = await authedGet("/auth/me", "not.a.token");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe("POST /auth/logout", () => {
  test("200 — signs out and invalidates token", async () => {
    const { token } = await register();
    const res = await authedPost("/auth/logout", token);
    expect(res.status).toBe(200);
    const body = await res.json() as { message: string };
    expect(body.message).toBe("Signed out");
  });

  test("token is rejected after logout", async () => {
    const { token } = await register();
    await authedPost("/auth/logout", token);
    const res = await authedGet("/auth/me", token);
    expect(res.status).toBe(401);
    const body = await res.json() as ErrBody;
    expect(body.error).toBe("Token revoked");
  });

  test("401 — no token", async () => {
    const res = await post(app, "/auth/logout", {});
    expect(res.status).toBe(401);
  });
});
