import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../src/db/schema";
import { createApp } from "../src/app";

export function makeTestApp() {
  const sqlite = new Database(":memory:");
  sqlite.query("PRAGMA foreign_keys = ON;").run();
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./src/db/migrations" });
  const app = createApp(db);
  return { app, db, sqlite };
}

export function post(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
