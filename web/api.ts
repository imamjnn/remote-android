import type { Device, IceServerConfig, LocationPoint } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ id: string; email: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  me: () => request<{ id: string; email: string }>("/api/auth/me"),

  listDevices: () => request<Device[]>("/api/devices"),

  renameDevice: (id: string, label: string) =>
    request<Device>(`/api/devices/${id}`, { method: "PATCH", body: JSON.stringify({ label }) }),

  unpairDevice: (id: string) => request<{ ok: true }>(`/api/devices/${id}`, { method: "DELETE" }),

  setTracking: (id: string, action: "start" | "stop") =>
    request<{ ok: true; desiredTracking: boolean }>(`/api/devices/${id}/command`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  locationHistory: (id: string, params?: { from?: number; to?: number; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.from) search.set("from", String(params.from));
    if (params?.to) search.set("to", String(params.to));
    if (params?.limit) search.set("limit", String(params.limit));
    const query = search.toString();
    return request<LocationPoint[]>(`/api/devices/${id}/locations${query ? `?${query}` : ""}`);
  },

  iceServers: () => request<{ iceServers: IceServerConfig[] }>("/api/ice-servers"),
};
