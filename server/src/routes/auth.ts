import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { users, revokedTokens } from "../db/schema";
import { signToken } from "../lib/jwt";
import { authMiddleware, type AuthVariables } from "../middleware/auth";
import {
  RegisterBody,
  LoginBody,
  AuthResponse,
  UserOut,
  ErrorResponse,
  MessageResponse,
} from "../types";

const registerRoute = createRoute({
  method: "post",
  path: "/register",
  tags: ["auth"],
  summary: "Create a new account",
  request: { body: { content: { "application/json": { schema: RegisterBody } } } },
  responses: {
    201: { content: { "application/json": { schema: AuthResponse } }, description: "Account created" },
    409: { content: { "application/json": { schema: ErrorResponse } }, description: "Email already in use" },
  },
});

const loginRoute = createRoute({
  method: "post",
  path: "/login",
  tags: ["auth"],
  summary: "Sign in to an existing account",
  request: { body: { content: { "application/json": { schema: LoginBody } } } },
  responses: {
    200: { content: { "application/json": { schema: AuthResponse } }, description: "Login successful" },
    401: { content: { "application/json": { schema: ErrorResponse } }, description: "Invalid credentials" },
  },
});

const logoutRoute = createRoute({
  method: "post",
  path: "/logout",
  tags: ["auth"],
  summary: "Sign out and invalidate current token",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { content: { "application/json": { schema: MessageResponse } }, description: "Signed out" },
    401: { content: { "application/json": { schema: ErrorResponse } }, description: "Unauthorized" },
  },
});

const meRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["auth"],
  summary: "Get the currently authenticated user",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { content: { "application/json": { schema: UserOut } }, description: "Current user" },
    401: { content: { "application/json": { schema: ErrorResponse } }, description: "Unauthorized" },
  },
});

export function authRouter(db: DB) {
  const router = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ error: "Validation failed" }, 422);
      }
    },
  });

  router.openapi(registerRoute, async (c) => {
    const { email, password } = c.req.valid("json");

    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
      return c.json({ error: "Email already in use" }, 409);
    }

    const passwordHash = await Bun.password.hash(password);
    const result = await db.insert(users).values({ email, passwordHash }).returning();
    const user = result[0]!;

    const token = await signToken({ sub: String(user.id), email: user.email });
    return c.json({ token, user: { id: user.id, email: user.email } }, 201);
  });

  router.openapi(loginRoute, async (c) => {
    const { email, password } = c.req.valid("json");

    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const valid = await Bun.password.verify(password, user.passwordHash);
    if (!valid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const token = await signToken({ sub: String(user.id), email: user.email });
    return c.json({ token, user: { id: user.id, email: user.email } }, 200);
  });

  router.use("/logout", authMiddleware(db));
  router.use("/me", authMiddleware(db));

  router.openapi(logoutRoute, async (c) => {
    const jti = c.get("jti");
    const exp = c.get("tokenExp");
    await db.insert(revokedTokens).values({ jti, expiresAt: new Date(exp * 1000) });
    return c.json({ message: "Signed out" }, 200);
  });

  router.openapi(meRoute, async (c) => {
    const user = c.get("user");
    return c.json({ id: user.id, email: user.email }, 200);
  });

  return router;
}
