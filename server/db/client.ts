import { Database } from "bun:sqlite";

const dbPath = process.env.DATABASE_PATH ?? "app.sqlite";

export const db = new Database(dbPath, { create: true });

db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;");

const schemaPath = new URL("./schema.sql", import.meta.url);
db.exec(await Bun.file(schemaPath).text());
