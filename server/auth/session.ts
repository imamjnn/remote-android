import type { BunRequest } from "bun";
import { db } from "../db/client";
import { newId } from "../lib/ids";

const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface SessionRow {
  parent_id: string;
  expires_at: number;
}

export function createSession(req: BunRequest, parentId: string): void {
  const id = newId();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  db.query(
    `INSERT INTO sessions (id, parent_id, expires_at, created_at) VALUES ($id, $parentId, $expiresAt, $now)`,
  ).run({ $id: id, $parentId: parentId, $expiresAt: expiresAt, $now: now });

  req.cookies.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function destroySession(req: BunRequest): void {
  const id = req.cookies.get(SESSION_COOKIE);
  if (id) {
    db.query(`DELETE FROM sessions WHERE id = $id`).run({ $id: id });
  }
  req.cookies.delete(SESSION_COOKIE, { path: "/" });
}

export function getSessionParentId(req: BunRequest): string | null {
  const id = req.cookies.get(SESSION_COOKIE);
  if (!id) return null;

  const row = db
    .query(`SELECT parent_id, expires_at FROM sessions WHERE id = $id`)
    .get({ $id: id }) as SessionRow | null;

  if (!row) return null;

  if (row.expires_at < Date.now()) {
    db.query(`DELETE FROM sessions WHERE id = $id`).run({ $id: id });
    return null;
  }

  return row.parent_id;
}
