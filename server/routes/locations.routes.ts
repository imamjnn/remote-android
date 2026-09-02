import type { BunRequest } from "bun";
import { db } from "../db/client";
import { getSessionParentId } from "../auth/session";
import { notFound, unauthorized } from "../lib/http";

export const locationsRoutes = {
  "/api/devices/:id/locations": {
    GET: (req: BunRequest<"/api/devices/:id/locations">) => {
      const parentId = getSessionParentId(req);
      if (!parentId) return unauthorized();

      const device = db
        .query(`SELECT id FROM child_devices WHERE id = $id AND parent_id = $parentId`)
        .get({ $id: req.params.id, $parentId: parentId });
      if (!device) return notFound();

      const url = new URL(req.url);
      const from = Number(url.searchParams.get("from")) || 0;
      const to = Number(url.searchParams.get("to")) || Date.now();
      const limit = Math.min(Number(url.searchParams.get("limit")) || 500, 5000);

      const points = db
        .query(
          `SELECT id, lat, lng, accuracy_m, speed_mps, recorded_at
           FROM location_points
           WHERE device_id = $deviceId AND recorded_at BETWEEN $from AND $to
           ORDER BY recorded_at ASC
           LIMIT $limit`,
        )
        .all({ $deviceId: req.params.id, $from: from, $to: to, $limit: limit });

      return Response.json(points);
    },
  },
};
