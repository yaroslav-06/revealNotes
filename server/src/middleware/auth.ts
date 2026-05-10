import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { verifyToken } from "../lib/jwt";
import { revokedTokens } from "../db/schema";
import type { DB } from "../db/client";

export type AuthVariables = {
  user: { id: number; email: string };
  jti: string;
  tokenExp: number;
};

export function authMiddleware(db: DB) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      const payload = await verifyToken(header.slice(7));
      const revoked = await db.query.revokedTokens.findFirst({
        where: eq(revokedTokens.jti, payload.jti),
      });
      if (revoked) return c.json({ error: "Token revoked" }, 401);
      c.set("user", { id: Number(payload.sub), email: payload.email });
      c.set("jti", payload.jti);
      c.set("tokenExp", payload.exp);
      await next();
    } catch {
      return c.json({ error: "Unauthorized" }, 401);
    }
  });
}
