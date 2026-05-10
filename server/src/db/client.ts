import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const sqlite = new Database(process.env.DATABASE_URL ?? "data.db", {
  create: true,
});

sqlite.query("PRAGMA journal_mode = WAL;").run();
sqlite.query("PRAGMA foreign_keys = ON;").run();

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
