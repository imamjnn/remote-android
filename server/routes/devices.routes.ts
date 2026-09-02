import type { BunRequest, Server } from "bun";
import { db } from "../db/client";
import { getSessionParentId } from "../auth/session";
import { deviceTopic, parentTopic } from "../realtime/topics";
import type { WSData } from "../ws/types";
import { jsonError, notFound, unauthorized } from "../lib/http";
import { newId, newDeviceToken, hashToken } from "../lib/ids";

interface DeviceRow {
  id: string;
  parent_id: string;
  label: string;
  desired_tracking: number;
  is_online: number;
  last_seen_at: number | null;
  last_lat: number | null;
  last_lng: number | null;
  last_fix_at: number | null;
  created_at: number;
}

function ownedDevice(deviceId: string, parentId: string): DeviceRow | null {
  return db
    .query(
      `SELECT id, parent_id, label, desired_tracking, is_online, last_seen_at, last_lat, last_lng, last_fix_at, created_at
       FROM child_devices WHERE id = $id AND parent_id = $parentId`,
    )
    .get({ $id: deviceId, $parentId: parentId }) as DeviceRow | null;
}

export const devicesRoutes = {
  // Called by the child app itself on first launch -- no auth, no pairing
  // code. There's exactly one parent in this deployment (see
  // server/auth/bootstrap.ts), so a newly installed app can only ever
  // belong to that parent; there's nothing to disambiguate.
  "/api/devices/register": {
    POST: async (req: BunRequest, server: Server<WSData>) => {
      const body = await req.json().catch(() => ({}) as Record<string, unknown>);
      const label =
        typeof body?.deviceLabel === "string" && body.deviceLabel.trim() ? body.deviceLabel.trim() : "Child device";

      // ORDER BY makes this deterministic even if more than one parent row
      // ever exists (shouldn't happen in normal operation -- there's no
      // register endpoint -- but SQLite gives no ordering guarantee for a
      // bare LIMIT 1, and picking an unpredictable row here would silently
      // attach a new device to the wrong parent).
      const parent = db.query(`SELECT id FROM parents ORDER BY created_at ASC LIMIT 1`).get() as {
        id: string;
      } | null;
      if (!parent) return jsonError("No parent account configured yet", 503);

      const deviceId = newId();
      const deviceToken = newDeviceToken();
      const now = Date.now();

      db.query(
        `INSERT INTO child_devices (id, parent_id, label, device_token_hash, created_at) VALUES ($id, $parentId, $label, $tokenHash, $now)`,
      ).run({ $id: deviceId, $parentId: parent.id, $label: label, $tokenHash: hashToken(deviceToken), $now: now });

      server.publish(parentTopic(parent.id), JSON.stringify({ type: "device_paired", deviceId, label }));

      return Response.json({ deviceId, deviceToken }, { status: 201 });
    },
  },

  "/api/devices": {
    GET: (req: BunRequest) => {
      const parentId = getSessionParentId(req);
      if (!parentId) return unauthorized();

      const devices = db
        .query(
          `SELECT id, parent_id, label, desired_tracking, is_online, last_seen_at, last_lat, last_lng, last_fix_at, created_at
           FROM child_devices WHERE parent_id = $parentId ORDER BY created_at ASC`,
        )
        .all({ $parentId: parentId });

      return Response.json(devices);
    },
  },

  "/api/devices/:id": {
    GET: (req: BunRequest<"/api/devices/:id">) => {
      const parentId = getSessionParentId(req);
      if (!parentId) return unauthorized();

      const device = ownedDevice(req.params.id, parentId);
      if (!device) return notFound();
      return Response.json(device);
    },

    PATCH: async (req: BunRequest<"/api/devices/:id">) => {
      const parentId = getSessionParentId(req);
      if (!parentId) return unauthorized();

      const device = ownedDevice(req.params.id, parentId);
      if (!device) return notFound();

      const body = await req.json().catch(() => null);
      const label = typeof body?.label === "string" ? body.label.trim() : "";
      if (!label) return jsonError("Missing label", 400);

      db.query(`UPDATE child_devices SET label = $label WHERE id = $id`).run({ $label: label, $id: device.id });
      return Response.json({ ...device, label });
    },

    DELETE: (req: BunRequest<"/api/devices/:id">) => {
      const parentId = getSessionParentId(req);
      if (!parentId) return unauthorized();

      const device = ownedDevice(req.params.id, parentId);
      if (!device) return notFound();

      db.query(`DELETE FROM child_devices WHERE id = $id`).run({ $id: device.id });
      return Response.json({ ok: true });
    },
  },

  "/api/devices/:id/command": {
    POST: async (req: BunRequest<"/api/devices/:id/command">, server: Server<WSData>) => {
      const parentId = getSessionParentId(req);
      if (!parentId) return unauthorized();

      const device = ownedDevice(req.params.id, parentId);
      if (!device) return notFound();

      const body = await req.json().catch(() => null);
      const action = body?.action;
      if (action !== "start" && action !== "stop") return jsonError('action must be "start" or "stop"', 400);

      const desiredTracking = action === "start" ? 1 : 0;
      db.query(`UPDATE child_devices SET desired_tracking = $desired WHERE id = $id`).run({
        $desired: desiredTracking,
        $id: device.id,
      });

      server.publish(deviceTopic(device.id), JSON.stringify({ type: "command", action }));
      server.publish(
        parentTopic(parentId),
        JSON.stringify({ type: "tracking_state", deviceId: device.id, desiredTracking: Boolean(desiredTracking) }),
      );

      return Response.json({ ok: true, desiredTracking: Boolean(desiredTracking) });
    },
  },
};
