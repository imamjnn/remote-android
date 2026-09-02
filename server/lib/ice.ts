export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * STUN/TURN servers handed to both the Android app and the dashboard for
 * WebRTC (see web/webrtc.ts, android net/DeviceSocket.kt). Defaults to a
 * public STUN-only server, which works for same-network testing but will
 * fail to connect across some real-world NATs (notably mobile carrier
 * CGNAT) without a TURN relay. Set ICE_SERVERS to a JSON array to add one,
 * e.g. `[{"urls":"turn:turn.example.com:3478","username":"...","credential":"..."}]`.
 */
export function getIceServers(): IceServerConfig[] {
  const raw = process.env.ICE_SERVERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      console.warn("[ice] ICE_SERVERS env var is not valid JSON, falling back to default STUN");
    }
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}
