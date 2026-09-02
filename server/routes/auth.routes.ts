import type { BunRequest } from "bun";
import { db } from "../db/client";
import { verifyPassword } from "../auth/password";
import { createSession, destroySession, getSessionParentId } from "../auth/session";
import { jsonError, unauthorized } from "../lib/http";

interface ParentRow {
  id: string;
  email: string;
  password_hash: string;
}

export const authRoutes = {
  "/api/auth/login": {
    POST: async (req: BunRequest) => {
      const body = await req.json().catch(() => null);
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body?.password === "string" ? body.password : "";

      const parent = db.query(`SELECT id, email, password_hash FROM parents WHERE email = $email`).get({
        $email: email,
      }) as ParentRow | null;

      if (!parent || !(await verifyPassword(password, parent.password_hash))) {
        return jsonError("Invalid email or password", 401);
      }

      createSession(req, parent.id);
      return Response.json({ id: parent.id, email: parent.email });
    },
  },

  "/api/auth/logout": {
    POST: (req: BunRequest) => {
      destroySession(req);
      return Response.json({ ok: true });
    },
  },

  "/api/auth/me": {
    GET: (req: BunRequest) => {
      const parentId = getSessionParentId(req);
      if (!parentId) return unauthorized();

      const parent = db.query(`SELECT id, email FROM parents WHERE id = $id`).get({ $id: parentId }) as
        | { id: string; email: string }
        | null;

      if (!parent) return unauthorized();
      return Response.json(parent);
    },
  },
};
