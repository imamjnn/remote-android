import { db } from "../db/client";
import { hashPassword } from "./password";
import { newId } from "../lib/ids";

const DEFAULT_EMAIL = "admin@example.com";
const DEFAULT_PASSWORD = "changeme123";

/**
 * This deployment has exactly one parent account -- there is no
 * registration flow. On first boot, seed it from PARENT_EMAIL /
 * PARENT_PASSWORD (falling back to an insecure default for local dev).
 * Safe to call on every startup: a no-op once a parent row exists.
 */
export async function ensureSingleParent(): Promise<void> {
  const existing = db.query(`SELECT id FROM parents LIMIT 1`).get();
  if (existing) return;

  const email = (process.env.PARENT_EMAIL ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = process.env.PARENT_PASSWORD ?? DEFAULT_PASSWORD;

  if (!process.env.PARENT_EMAIL || !process.env.PARENT_PASSWORD) {
    console.warn(
      `[bootstrap] PARENT_EMAIL/PARENT_PASSWORD not set -- using default login "${email}" / "${password}". ` +
        `Set both env vars before running this anywhere reachable by anyone else.`,
    );
  }

  const passwordHash = await hashPassword(password);
  db.query(
    `INSERT INTO parents (id, email, password_hash, created_at) VALUES ($id, $email, $passwordHash, $now)`,
  ).run({ $id: newId(), $email: email, $passwordHash: passwordHash, $now: Date.now() });

  console.log(`[bootstrap] Created parent account: ${email}`);
}
