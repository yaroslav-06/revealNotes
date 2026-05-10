import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const sqlite = new Database(process.env.DATABASE_URL ?? "data.db", {
  create: true,
});
sqlite.query("PRAGMA foreign_keys = ON;").run();

const db = drizzle(sqlite);
migrate(db, { migrationsFolder: "./src/db/migrations" });

console.log("Migrations applied.");
sqlite.close();
