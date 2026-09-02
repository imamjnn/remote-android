import type { Device } from "../types";
import { DeviceList } from "../components/DeviceList";

export function DeviceListPage({
  email,
  devices,
  onSelect,
  onLogout,
}: {
  email: string;
  devices: Device[];
  onSelect: (id: string) => void;
  onLogout: () => void;
}) {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Tracking Anak</h1>
        <div className="header-actions">
          <span className="header-email">{email}</span>
          <button type="button" onClick={onLogout}>
            Keluar
          </button>
        </div>
      </header>

      <main className="device-list-page">
        <DeviceList devices={devices} onSelect={onSelect} />
      </main>
    </div>
  );
}
