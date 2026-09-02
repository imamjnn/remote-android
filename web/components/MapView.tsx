import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import type { Device, LocationPoint } from "../types";

// Bun's bundler resolves image imports to hashed URLs, so point Leaflet's
// default marker icon at them instead of the package's relative asset paths
// (which 404 once the CSS/JS is bundled elsewhere).
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
});

const DEFAULT_CENTER: [number, number] = [-6.2, 106.8]; // Jakarta, fallback when no fix yet

export function MapView({
  devices,
  historyPoints,
  selectedId,
}: {
  devices: Device[];
  historyPoints: LocationPoint[];
  selectedId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // The map is created before the flex layout settles on its final size,
    // so Leaflet caches the wrong container dimensions unless told to
    // re-measure once the layout is stable.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    // Follow the selected device; if nothing is selected yet (e.g. only one
    // device is paired), follow that one so the map still has a reason to move.
    const followedId = selectedId ?? (devices.length === 1 ? devices[0]?.id : null);

    for (const device of devices) {
      if (device.last_lat == null || device.last_lng == null) continue;
      seen.add(device.id);

      const position: [number, number] = [device.last_lat, device.last_lng];
      let marker = markersRef.current.get(device.id);

      if (!marker) {
        marker = L.marker(position).addTo(map).bindPopup(device.label);
        markersRef.current.set(device.id, marker);
      } else {
        marker.setLatLng(position);
        marker.setPopupContent(device.label);
      }

      if (device.id === followedId) {
        // Zoom in the first time we get a fix (or after the user zoomed way
        // out), but otherwise just pan so we don't fight a zoom level the
        // user picked on purpose.
        const targetZoom = map.getZoom() < 14 ? 16 : map.getZoom();
        map.setView(position, targetZoom, { animate: true });
      }
    }

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [devices, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    polylineRef.current?.remove();
    polylineRef.current = null;

    if (historyPoints.length === 0) return;

    const latLngs: [number, number][] = historyPoints.map((p) => [p.lat, p.lng]);
    polylineRef.current = L.polyline(latLngs, { color: "#3388ff" }).addTo(map);
    map.fitBounds(polylineRef.current.getBounds(), { padding: [32, 32] });
  }, [historyPoints]);

  return <div ref={containerRef} className="map-view" />;
}
