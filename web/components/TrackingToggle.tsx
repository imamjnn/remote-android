import { useState } from "react";
import { api } from "../api";
import type { Device } from "../types";

export function TrackingToggle({ device }: { device: Device }) {
  const [pending, setPending] = useState(false);
  const isTracking = Boolean(device.desired_tracking);

  async function toggle() {
    setPending(true);
    try {
      await api.setTracking(device.id, isTracking ? "stop" : "start");
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" className={`tracking-toggle ${isTracking ? "on" : "off"}`} onClick={toggle} disabled={pending}>
      {isTracking ? "Tracking: ON" : "Tracking: OFF"}
    </button>
  );
}
