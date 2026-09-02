import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { connectParentSocket, type ParentSocket } from "../ws";
import type { Device, LocationPoint, ParentWSMessage } from "../types";
import { DeviceListPage } from "./DeviceListPage";
import { DeviceDetailPage } from "./DeviceDetailPage";

export function DashboardPage({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyPoints, setHistoryPoints] = useState<LocationPoint[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [socket, setSocket] = useState<ParentSocket | null>(null);
  const [signal, setSignal] = useState<{ message: ParentWSMessage; seq: number } | null>(null);
  const seqRef = useRef(0);

  const applyMessage = useCallback((msg: ParentWSMessage) => {
    if (msg.type === "snapshot") {
      setDevices(msg.devices);
      return;
    }

    if (msg.type === "location") {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === msg.deviceId
            ? { ...d, last_lat: msg.lat, last_lng: msg.lng, last_fix_at: msg.recordedAt, is_online: 1 }
            : d,
        ),
      );
      return;
    }

    if (msg.type === "device_status") {
      setDevices((prev) => prev.map((d) => (d.id === msg.deviceId ? { ...d, is_online: msg.isOnline ? 1 : 0 } : d)));
      return;
    }

    if (msg.type === "tracking_state") {
      setDevices((prev) =>
        prev.map((d) => (d.id === msg.deviceId ? { ...d, desired_tracking: msg.desiredTracking ? 1 : 0 } : d)),
      );
      return;
    }

    if (msg.type === "device_paired") {
      api.listDevices().then(setDevices);
      return;
    }

    if (msg.type === "webrtc_offer" || msg.type === "webrtc_ice_candidate") {
      seqRef.current += 1;
      setSignal({ message: msg, seq: seqRef.current });
    }
  }, []);

  useEffect(() => {
    api.listDevices().then(setDevices);
    const parentSocket = connectParentSocket(applyMessage);
    setSocket(parentSocket);
    return () => parentSocket.disconnect();
  }, [applyMessage]);

  useEffect(() => {
    if (!selectedId || !showHistory) {
      setHistoryPoints([]);
      return;
    }
    api.locationHistory(selectedId).then(setHistoryPoints);
  }, [selectedId, showHistory]);

  const selectedDevice = devices.find((d) => d.id === selectedId) ?? null;

  if (selectedDevice && socket) {
    return (
      <DeviceDetailPage
        device={selectedDevice}
        historyPoints={historyPoints}
        showHistory={showHistory}
        onToggleHistory={setShowHistory}
        socket={socket}
        signal={signal}
        onBack={() => {
          setSelectedId(null);
          setShowHistory(false);
        }}
      />
    );
  }

  return <DeviceListPage email={email} devices={devices} onSelect={setSelectedId} onLogout={onLogout} />;
}
