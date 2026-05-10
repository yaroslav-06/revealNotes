import { db } from "./db/client";
import { createApp } from "./app";

const app = createApp(db);

export default {
  port: process.env.PORT ?? 3000,
  fetch: app.fetch,
};

console.log(`Server running on http://localhost:${process.env.PORT ?? 3000}`);
