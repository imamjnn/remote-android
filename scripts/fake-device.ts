/**
 * Simulates a paired child device streaming GPS points over /ws/device.
 * Usage: bun run fake-device -- <deviceId> <deviceToken> [--host ws://localhost:3000]
 *
 * Register a device first (POST /api/devices/register -- no auth, no code
 * needed, same call the Android app makes on first launch), then pass the
 * returned deviceId/deviceToken here to verify the realtime pipeline
 * end-to-end without touching Android at all.
 */

const args = process.argv.slice(2);
const deviceId = args[0];
const deviceToken = args[1];
const hostArgIndex = args.indexOf("--host");
const host = hostArgIndex !== -1 ? args[hostArgIndex + 1] : "ws://localhost:3000";

if (!deviceId || !deviceToken) {
  console.error("Usage: bun run fake-device -- <deviceId> <deviceToken> [--host ws://localhost:3000]");
  process.exit(1);
}

const url = `${host}/ws/device?deviceId=${encodeURIComponent(deviceId)}&token=${encodeURIComponent(deviceToken)}`;
console.log(`Connecting to ${url}`);

const socket = new WebSocket(url);

// Walk a small circle around Jakarta (Monas) so movement is visible on the map.
const center = { lat: -6.1754, lng: 106.8272 };
const radius = 0.01;
let angle = 0;
let tracking = false;
let interval: ReturnType<typeof setInterval> | null = null;

function sendPoint() {
  if (!tracking) return;
  angle += 0.1;
  const lat = center.lat + radius * Math.cos(angle);
  const lng = center.lng + radius * Math.sin(angle);

  socket.send(
    JSON.stringify({
      type: "location",
      lat,
      lng,
      accuracy: 8,
      speed: 1.2,
      recordedAt: Date.now(),
    }),
  );
  console.log(`sent location: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
}

socket.addEventListener("open", () => {
  console.log("connected");
});

socket.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  console.log("received command:", msg);

  if (msg.type === "command") {
    tracking = msg.action === "start";
    if (tracking && !interval) {
      interval = setInterval(sendPoint, 3000);
    }
    if (!tracking && interval) {
      clearInterval(interval);
      interval = null;
    }
  }
});

socket.addEventListener("close", () => {
  console.log("disconnected");
  if (interval) clearInterval(interval);
  process.exit(0);
});

socket.addEventListener("error", (err) => {
  console.error("socket error", err);
});
