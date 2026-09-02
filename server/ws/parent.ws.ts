import type { BunRequest, Server, ServerWebSocket } from "bun";
import { db } from "../db/client";
import { getSessionParentId } from "../auth/session";
import { deviceTopic, parentTopic } from "../realtime/topics";
import type { WSData } from "./types";

export function upgradeParent(req: BunRequest, server: Server<WSData>): Response | undefined {
  const parentId = getSessionParentId(req);
  if (!parentId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const upgraded = server.upgrade(req, {
    data: { kind: "parent", parentId } satisfies WSData,
  });

  if (!upgraded) {
    return new Response("Upgrade failed", { status: 400 });
  }
}

function ownsDevice(deviceId: string, parentId: string): boolean {
  return (
    db.query(`SELECT id FROM child_devices WHERE id = $id AND parent_id = $parentId`).get({
      $id: deviceId,
      $parentId: parentId,
    }) != null
  );
}

export const parentWs = {
  open(ws: ServerWebSocket<WSData>) {
    if (ws.data.kind !== "parent") return;
    ws.subscribe(parentTopic(ws.data.parentId));

    const devices = db
      .query(
        `SELECT id, label, desired_tracking, is_online, last_seen_at, last_lat, last_lng, last_fix_at
         FROM child_devices WHERE parent_id = $parentId`,
      )
      .all({ $parentId: ws.data.parentId });

    ws.send(JSON.stringify({ type: "snapshot", devices }));
  },

  // The dashboard's live-camera panel drives WebRTC signaling through this
  // socket: it targets a specific device it owns, and everything here is
  // just relayed to that device's socket (see server/ws/device.ws.ts for the
  // other half of the relay). The server never looks at the video itself.
  message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
    if (ws.data.kind !== "parent") return;

    let payload: Record<string, unknown> | null;
    try {
      payload = JSON.parse(typeof message === "string" ? message : message.toString());
    } catch {
      return;
    }
    if (!payload) return;

    const type = payload.type;
    if (
      type !== "start_stream" &&
      type !== "stop_stream" &&
      type !== "webrtc_answer" &&
      type !== "webrtc_ice_candidate"
    ) {
      return;
    }

    const deviceId = typeof payload.deviceId === "string" ? payload.deviceId : null;
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;
    if (!deviceId || !sessionId || !ownsDevice(deviceId, ws.data.parentId)) return;

    if (type === "start_stream") {
      const camera = payload.camera === "front" ? "front" : "back";
      ws.publish(
        deviceTopic(deviceId),
        JSON.stringify({ type: "command", action: "start_stream", sessionId, camera }),
      );
      return;
    }

    if (type === "stop_stream") {
      ws.publish(deviceTopic(deviceId), JSON.stringify({ type: "command", action: "stop_stream", sessionId }));
      return;
    }

    if (type === "webrtc_answer") {
      const sdp = typeof payload.sdp === "string" ? payload.sdp : null;
      if (!sdp) return;
      ws.publish(deviceTopic(deviceId), JSON.stringify({ type: "webrtc_answer", sessionId, sdp }));
      return;
    }

    if (type === "webrtc_ice_candidate") {
      if (!payload.candidate) return;
      ws.publish(
        deviceTopic(deviceId),
        JSON.stringify({ type: "webrtc_ice_candidate", sessionId, candidate: payload.candidate }),
      );
    }
  },

  close(ws: ServerWebSocket<WSData>) {
    if (ws.data.kind !== "parent") return;
    ws.unsubscribe(parentTopic(ws.data.parentId));
  },
};
