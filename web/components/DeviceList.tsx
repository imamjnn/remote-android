import type { Device } from "../types";

export function DeviceList({ devices, onSelect }: { devices: Device[]; onSelect: (id: string) => void }) {
  if (devices.length === 0) {
    return (
      <p className="empty">
        Belum ada device. Install aplikasi di HP anak dan arahkan ke server ini — device akan otomatis muncul di
        sini begitu aplikasi dibuka.
      </p>
    );
  }

  return (
    <ul className="device-list">
      {devices.map((device) => (
        <li key={device.id} onClick={() => onSelect(device.id)}>
          <span className="device-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <rect x="7" y="2" width="10" height="20" rx="2" />
              <line x1="11" y1="18" x2="13" y2="18" />
            </svg>
          </span>

          <div className="device-info">
            <strong>{device.label}</strong>
            <span className="device-meta">
              <span className={`status-dot ${device.is_online ? "online" : "offline"}`} />
              {device.is_online ? "Online" : "Offline"}
              {device.last_seen_at ? ` · ${new Date(device.last_seen_at).toLocaleTimeString()}` : ""}
            </span>
          </div>

          {Boolean(device.desired_tracking) && <span className="tracking-badge">Tracking</span>}
          <span className="chevron" aria-hidden="true">
            ›
          </span>
        </li>
      ))}
    </ul>
  );
}
