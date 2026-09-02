import type { BunRequest, Server, ServerWebSocket } from "bun";
import { db } from "../db/client";
import { hashToken } from "../lib/ids";
import { deviceTopic, parentTopic } from "../realtime/topics";
import type { WSData } from "./types";

interface DeviceAuthRow {
  id: string;
  parent_id: string;
  device_token_hash: string;
}

interface DeviceTrackingRow {
  desired_tracking: number;
}

export function upgradeDevice(req: BunRequest, server: Server<WSData>): Response | undefined {
  const url = new URL(req.url);
  const deviceId = url.searchParams.get("deviceId");
  const token = url.searchParams.get("token");

  if (!deviceId || !token) {
    return new Response("Missing deviceId or token", { status: 400 });
  }

  const device = db
    .query(`SELECT id, parent_id, device_token_hash FROM child_devices WHERE id = $id`)
    .get({ $id: deviceId }) as DeviceAuthRow | null;

  if (!device || device.device_token_hash !== hashToken(token)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const upgraded = server.upgrade(req, {
    data: { kind: "device", deviceId: device.id, parentId: device.parent_id } satisfies WSData,
  });

  if (!upgraded) {
    return new Response("Upgrade failed", { status: 400 });
  }
}

export const deviceWs = {
  open(ws: ServerWebSocket<WSData>) {
    if (ws.data.kind !== "device") return;
    const now = Date.now();

    db.query(`UPDATE child_devices SET is_online = 1, last_seen_at = $now WHERE id = $id`).run({
      $now: now,
      $id: ws.data.deviceId,
    });

    ws.subscribe(deviceTopic(ws.data.deviceId));

    const row = db
      .query(`SELECT desired_tracking FROM child_devices WHERE id = $id`)
      .get({ $id: ws.data.deviceId }) as DeviceTrackingRow | null;

    ws.send(JSON.stringify({ type: "command", action: row?.desired_tracking ? "start" : "stop" }));

    ws.publish(
      parentTopic(ws.data.parentId),
      JSON.stringify({ type: "device_status", deviceId: ws.data.deviceId, isOnline: true }),
    );
  },

  message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
    if (ws.data.kind !== "device") return;

    let payload: Record<string, unknown> | null;
    try {
      payload = JSON.parse(typeof message === "string" ? message : message.toString());
    } catch {
      return;
    }

    // The device is the WebRTC offerer (it owns the camera); these just get
    // relayed to whichever parent dashboard tab started the session. See
    // server/ws/parent.ws.ts for the other half of the relay.
    if (payload?.type === "webrtc_offer" || payload?.type === "webrtc_ice_candidate") {
      const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;
      if (!sessionId) return;

      if (payload.type === "webrtc_offer") {
        const sdp = typeof payload.sdp === "string" ? payload.sdp : null;
        if (!sdp) return;
        ws.publish(
          parentTopic(ws.data.parentId),
          JSON.stringify({ type: "webrtc_offer", deviceId: ws.data.deviceId, sessionId, sdp }),
        );
      } else {
        if (!payload.candidate) return;
        ws.publish(
          parentTopic(ws.data.parentId),
          JSON.stringify({
            type: "webrtc_ice_candidate",
            deviceId: ws.data.deviceId,
            sessionId,
            candidate: payload.candidate,
          }),
        );
      }
      return;
    }

    if (payload?.type !== "location") return;

    const lat = Number(payload.lat);
    const lng = Number(payload.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const accuracy = Number.isFinite(Number(payload.accuracy)) ? Number(payload.accuracy) : null;
    const speed = Number.isFinite(Number(payload.speed)) ? Number(payload.speed) : null;
    const recordedAt = Number.isFinite(Number(payload.recordedAt)) ? Number(payload.recordedAt) : Date.now();
    const now = Date.now();

    db.query(
      `INSERT INTO location_points (device_id, lat, lng, accuracy_m, speed_mps, recorded_at, received_at)
       VALUES ($deviceId, $lat, $lng, $accuracy, $speed, $recordedAt, $now)`,
    ).run({
      $deviceId: ws.data.deviceId,
      $lat: lat,
      $lng: lng,
      $accuracy: accuracy,
      $speed: speed,
      $recordedAt: recordedAt,
      $now: now,
    });

    db.query(
      `UPDATE child_devices SET last_lat = $lat, last_lng = $lng, last_fix_at = $recordedAt, last_seen_at = $now WHERE id = $id`,
    ).run({ $lat: lat, $lng: lng, $recordedAt: recordedAt, $now: now, $id: ws.data.deviceId });

    ws.publish(
      parentTopic(ws.data.parentId),
      JSON.stringify({
        type: "location",
        deviceId: ws.data.deviceId,
        lat,
        lng,
        accuracy,
        speed,
        recordedAt,
      }),
    );
  },

  close(ws: ServerWebSocket<WSData>) {
    if (ws.data.kind !== "device") return;

    db.query(`UPDATE child_devices SET is_online = 0 WHERE id = $id`).run({ $id: ws.data.deviceId });

    ws.publish(
      parentTopic(ws.data.parentId),
      JSON.stringify({ type: "device_status", deviceId: ws.data.deviceId, isOnline: false }),
    );
  },
};
