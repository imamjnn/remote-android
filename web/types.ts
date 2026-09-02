export interface Device {
  id: string;
  label: string;
  desired_tracking: number;
  is_online: number;
  last_seen_at: number | null;
  last_lat: number | null;
  last_lng: number | null;
  last_fix_at: number | null;
  created_at?: number;
}

export interface LocationPoint {
  id?: number;
  lat: number;
  lng: number;
  accuracy_m?: number | null;
  speed_mps?: number | null;
  recorded_at: number;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type ParentWSMessage =
  | { type: "snapshot"; devices: Device[] }
  | { type: "location"; deviceId: string; lat: number; lng: number; accuracy: number | null; speed: number | null; recordedAt: number }
  | { type: "device_status"; deviceId: string; isOnline: boolean }
  | { type: "tracking_state"; deviceId: string; desiredTracking: boolean }
  | { type: "device_paired"; deviceId: string; label: string }
  | { type: "webrtc_offer"; deviceId: string; sessionId: string; sdp: string }
  | { type: "webrtc_ice_candidate"; deviceId: string; sessionId: string; candidate: RTCIceCandidateInit };
