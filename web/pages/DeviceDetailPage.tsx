import { MapView } from "../components/MapView";
import { TrackingToggle } from "../components/TrackingToggle";
import { LiveCameraPanel } from "../components/LiveCameraPanel";
import type { Device, LocationPoint, ParentWSMessage } from "../types";
import type { ParentSocket } from "../ws";

export function DeviceDetailPage({
  device,
  historyPoints,
  showHistory,
  onToggleHistory,
  socket,
  signal,
  onBack,
}: {
  device: Device;
  historyPoints: LocationPoint[];
  showHistory: boolean;
  onToggleHistory: (value: boolean) => void;
  socket: ParentSocket;
  signal: { message: ParentWSMessage; seq: number } | null;
  onBack: () => void;
}) {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <button type="button" className="back-button" onClick={onBack} aria-label="Kembali ke daftar device">
          ‹
        </button>
        <h1>{device.label}</h1>
      </header>

      <main className="device-detail-page">
        <div className="detail-map">
          <MapView devices={[device]} historyPoints={historyPoints} selectedId={device.id} />
        </div>

        <div className="detail-panels">
          <section className="detail-section">
            <div className="detail-section-header">
              <h2>Lokasi</h2>
              <span className={`status-dot ${device.is_online ? "online" : "offline"}`} />
              <span className="device-meta">{device.is_online ? "Online" : "Offline"}</span>
            </div>
            <TrackingToggle device={device} />
            <label className="history-toggle">
              <input type="checkbox" checked={showHistory} onChange={(e) => onToggleHistory(e.target.checked)} />
              Tampilkan riwayat rute
            </label>
          </section>

          <section className="detail-section">
            <LiveCameraPanel
              deviceId={device.id}
              isOnline={Boolean(device.is_online)}
              socket={socket}
              signal={signal}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
