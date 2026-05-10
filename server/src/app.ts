import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import type { DB } from "./db/client";
import { authRouter } from "./routes/auth";
import { notesRouter } from "./routes/notes";
import { votesRouter } from "./routes/votes";
import type { AuthVariables } from "./middleware/auth";

export function createApp(db: DB) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();

  app.route("/auth", authRouter(db));
  app.route("/notes", notesRouter(db));
  app.route("/notes", votesRouter(db));

  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: { title: "RevealNotes API", version: "1.0.0" },
    // @ts-ignore -- components is valid OpenAPI 3.0 but missing from Hono's narrowed type
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
  });
  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  return app;
}
