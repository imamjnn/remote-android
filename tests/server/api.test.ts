import { afterAll, describe, expect, test } from "bun:test";

process.env.DATABASE_PATH = ":memory:";
process.env.PARENT_EMAIL = "parent@example.com";
process.env.PARENT_PASSWORD = "supersecret";

const { appOptions } = await import("../../server/app");
const { db } = await import("../../server/db/client");
const { ensureSingleParent } = await import("../../server/auth/bootstrap");
const { newId } = await import("../../server/lib/ids");

await ensureSingleParent();

const server = Bun.serve({ ...appOptions, port: 0 });
const base = server.url.toString().replace(/\/$/, "");
const wsBase = base.replace(/^http/, "ws");

afterAll(() => {
  server.stop(true);
});

class Client {
  private cookie: string | null = null;

  get sessionCookie(): string | null {
    return this.cookie;
  }

  async raw(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    const res = await fetch(base + path, { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0] ?? setCookie;
    return res;
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
    const res = await this.raw(path, init);
    const body = (await res.json()) as T;
    return { status: res.status, body };
  }

  post<T>(path: string, data?: unknown) {
    return this.json<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  }
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("ws error")));
  });
}

function waitForMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.addEventListener("message", (event) => resolve(JSON.parse(event.data as string)), { once: true });
  });
}

function expectNoMessage(ws: WebSocket, timeoutMs = 150): Promise<void> {
  return new Promise((resolve, reject) => {
    const listener = (event: MessageEvent) => {
      reject(new Error(`unexpected message: ${event.data}`));
    };
    ws.addEventListener("message", listener, { once: true });
    setTimeout(() => {
      ws.removeEventListener("message", listener);
      resolve();
    }, timeoutMs);
  });
}

describe("single-parent bootstrap + auth", () => {
  test("bootstrap is idempotent and doesn't create a second parent", async () => {
    await ensureSingleParent();
    const count = db.query("SELECT COUNT(*) as n FROM parents").get() as { n: number };
    expect(count.n).toBe(1);
  });

  test("logs in with the seeded parent credentials", async () => {
    const client = new Client();
    const { status, body } = await client.post<{ email: string }>("/api/auth/login", {
      email: "parent@example.com",
      password: "supersecret",
    });
    expect(status).toBe(200);
    expect(body.email).toBe("parent@example.com");

    const me = await client.json<{ email: string }>("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("parent@example.com");
  });

  test("wrong password is rejected", async () => {
    const { status } = await new Client().post("/api/auth/login", {
      email: "parent@example.com",
      password: "wrong",
    });
    expect(status).toBe(401);
  });

  test("unauthenticated request is rejected", async () => {
    const { status } = await new Client().json("/api/auth/me");
    expect(status).toBe(401);
  });

  test("logout clears the session", async () => {
    const client = new Client();
    await client.post("/api/auth/login", { email: "parent@example.com", password: "supersecret" });
    await client.post("/api/auth/logout");
    const { status } = await client.json("/api/auth/me");
    expect(status).toBe(401);
  });

  test("there is no register endpoint", async () => {
    const { status } = await new Client().post("/api/auth/register", {
      email: "someone-else@example.com",
      password: "supersecret",
    });
    expect(status).toBe(404);
  });
});

describe("device auto-registration + lifecycle", () => {
  const parent = new Client();
  let deviceId: string;
  let deviceToken: string;

  test("parent logs in", async () => {
    const { status } = await parent.post("/api/auth/login", {
      email: "parent@example.com",
      password: "supersecret",
    });
    expect(status).toBe(200);
  });

  test("a freshly installed app registers itself with no auth and no code", async () => {
    const { status, body } = await new Client().post<{ deviceId: string; deviceToken: string }>(
      "/api/devices/register",
      { deviceLabel: "HP Anak" },
    );
    expect(status).toBe(201);
    expect(body.deviceId).toBeTruthy();
    expect(body.deviceToken).toBeTruthy();
    deviceId = body.deviceId;
    deviceToken = body.deviceToken;
  });

  test("the device immediately shows up for the parent", async () => {
    const list = await parent.json<Array<{ id: string; label: string }>>("/api/devices");
    expect(list.body.some((d) => d.id === deviceId && d.label === "HP Anak")).toBe(true);
  });

  test("a second registration creates a distinct device", async () => {
    const { status, body } = await new Client().post<{ deviceId: string }>("/api/devices/register");
    expect(status).toBe(201);
    expect(body.deviceId).not.toBe(deviceId);
  });

  test("devices are still scoped to their owning parent", async () => {
    // Bypass the single-parent policy directly at the DB layer to verify the
    // ownership check itself still holds, independent of how many parent
    // rows happen to exist.
    const otherParentId = newId();
    db.query(
      `INSERT INTO parents (id, email, password_hash, created_at) VALUES ($id, $email, $hash, $now)`,
    ).run({ $id: otherParentId, $email: "other@example.com", $hash: "x", $now: Date.now() });

    const otherSession = newId();
    db.query(
      `INSERT INTO sessions (id, parent_id, expires_at, created_at) VALUES ($id, $parentId, $expiresAt, $now)`,
    ).run({ $id: otherSession, $parentId: otherParentId, $expiresAt: Date.now() + 60_000, $now: Date.now() });

    const otherGet = await fetch(`${base}/api/devices/${deviceId}`, {
      headers: { cookie: `session=${otherSession}` },
    });
    expect(otherGet.status).toBe(404);

    const otherCommand = await fetch(`${base}/api/devices/${deviceId}/command`, {
      method: "POST",
      headers: { cookie: `session=${otherSession}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    expect(otherCommand.status).toBe(404);

    // This intentionally violated the single-parent invariant to test the
    // ownership check in isolation -- clean up so later tests (and their
    // own `/api/devices/register` calls, which assume exactly one parent
    // row) aren't affected by it.
    db.query(`DELETE FROM parents WHERE id = $id`).run({ $id: otherParentId });
  });

  test("owning parent can start/stop tracking", async () => {
    const start = await parent.post<{ desiredTracking: boolean }>(`/api/devices/${deviceId}/command`, {
      action: "start",
    });
    expect(start.status).toBe(200);
    expect(start.body.desiredTracking).toBe(true);

    const stop = await parent.post<{ desiredTracking: boolean }>(`/api/devices/${deviceId}/command`, {
      action: "stop",
    });
    expect(stop.body.desiredTracking).toBe(false);
  });

  test("device websocket rejects an invalid token", async () => {
    const ws = new WebSocket(`${wsBase}/ws/device?deviceId=${deviceId}&token=wrong-token`);
    await new Promise<void>((resolve) => {
      ws.addEventListener("close", (event) => {
        expect(event.code).not.toBe(1000);
        resolve();
      });
      ws.addEventListener("error", () => resolve());
    });
  });

  test("device websocket authenticates, receives desired state, and streams a location", async () => {
    await parent.post(`/api/devices/${deviceId}/command`, { action: "start" });

    const ws = new WebSocket(`${wsBase}/ws/device?deviceId=${deviceId}&token=${deviceToken}`);
    await waitForOpen(ws);

    const command = await waitForMessage(ws);
    expect(command).toEqual({ type: "command", action: "start" });

    ws.send(JSON.stringify({ type: "location", lat: -6.2, lng: 106.8, accuracy: 5, speed: 0, recordedAt: Date.now() }));

    // give the server a moment to persist + broadcast before we query history
    await new Promise((resolve) => setTimeout(resolve, 100));
    ws.close();

    const history = await parent.json<Array<{ lat: number; lng: number }>>(`/api/devices/${deviceId}/locations`);
    expect(history.body.length).toBeGreaterThan(0);
    expect(history.body.at(-1)?.lat).toBeCloseTo(-6.2);
  });
});

describe("webrtc signaling relay", () => {
  const parent = new Client();
  let deviceId: string;
  let deviceToken: string;

  test("setup: login and register a device", async () => {
    const login = await parent.post("/api/auth/login", { email: "parent@example.com", password: "supersecret" });
    expect(login.status).toBe(200);

    const { body } = await new Client().post<{ deviceId: string; deviceToken: string }>("/api/devices/register");
    deviceId = body.deviceId;
    deviceToken = body.deviceToken;
  });

  test("start_stream, offer/answer, and ICE candidates relay in both directions", async () => {
    const deviceSocket = new WebSocket(`${wsBase}/ws/device?deviceId=${deviceId}&token=${deviceToken}`);
    await waitForOpen(deviceSocket);
    await waitForMessage(deviceSocket); // initial {type:"command", action:"stop"} sent on connect

    // Bun's WebSocket constructor accepts a { headers } second argument as a
    // non-standard extension not reflected in the DOM lib's WebSocket type.
    const parentSocket = new WebSocket(`${wsBase}/ws/parent`, {
      headers: { cookie: parent.sessionCookie ?? "" },
    } as unknown as string[]);
    await waitForOpen(parentSocket);
    await waitForMessage(parentSocket); // initial {type:"snapshot", devices:[...]}

    const sessionId = "test-session-1";

    // parent -> device: start_stream becomes a command
    const commandPromise = waitForMessage(deviceSocket);
    parentSocket.send(JSON.stringify({ type: "start_stream", deviceId, sessionId, camera: "back" }));
    expect(await commandPromise).toEqual({ type: "command", action: "start_stream", sessionId, camera: "back" });

    // device -> parent: offer
    const offerPromise = waitForMessage(parentSocket);
    deviceSocket.send(JSON.stringify({ type: "webrtc_offer", sessionId, sdp: "fake-offer-sdp" }));
    expect(await offerPromise).toEqual({ type: "webrtc_offer", deviceId, sessionId, sdp: "fake-offer-sdp" });

    // parent -> device: answer
    const answerPromise = waitForMessage(deviceSocket);
    parentSocket.send(JSON.stringify({ type: "webrtc_answer", deviceId, sessionId, sdp: "fake-answer-sdp" }));
    expect(await answerPromise).toEqual({ type: "webrtc_answer", sessionId, sdp: "fake-answer-sdp" });

    // both directions: ICE candidates
    const candidateToParent = waitForMessage(parentSocket);
    deviceSocket.send(JSON.stringify({ type: "webrtc_ice_candidate", sessionId, candidate: { fake: "device-ice" } }));
    expect(await candidateToParent).toEqual({
      type: "webrtc_ice_candidate",
      deviceId,
      sessionId,
      candidate: { fake: "device-ice" },
    });

    const candidateToDevice = waitForMessage(deviceSocket);
    parentSocket.send(
      JSON.stringify({ type: "webrtc_ice_candidate", deviceId, sessionId, candidate: { fake: "parent-ice" } }),
    );
    expect(await candidateToDevice).toEqual({
      type: "webrtc_ice_candidate",
      sessionId,
      candidate: { fake: "parent-ice" },
    });

    // stop_stream also relays as a command
    const stopPromise = waitForMessage(deviceSocket);
    parentSocket.send(JSON.stringify({ type: "stop_stream", deviceId, sessionId }));
    expect(await stopPromise).toEqual({ type: "command", action: "stop_stream", sessionId });

    parentSocket.close();
    deviceSocket.close();
  });

  test("a parent cannot start a stream on a device they don't own", async () => {
    const otherParentId = newId();
    db.query(
      `INSERT INTO parents (id, email, password_hash, created_at) VALUES ($id, $email, $hash, $now)`,
    ).run({ $id: otherParentId, $email: "webrtc-intruder@example.com", $hash: "x", $now: Date.now() });

    const otherSession = newId();
    db.query(
      `INSERT INTO sessions (id, parent_id, expires_at, created_at) VALUES ($id, $parentId, $expiresAt, $now)`,
    ).run({ $id: otherSession, $parentId: otherParentId, $expiresAt: Date.now() + 60_000, $now: Date.now() });

    const deviceSocket = new WebSocket(`${wsBase}/ws/device?deviceId=${deviceId}&token=${deviceToken}`);
    await waitForOpen(deviceSocket);
    await waitForMessage(deviceSocket); // initial command

    const intruderSocket = new WebSocket(`${wsBase}/ws/parent`, {
      headers: { cookie: `session=${otherSession}` },
    } as unknown as string[]);
    await waitForOpen(intruderSocket);
    await waitForMessage(intruderSocket); // initial snapshot (empty devices for this parent)

    const noMessage = expectNoMessage(deviceSocket);
    intruderSocket.send(
      JSON.stringify({ type: "start_stream", deviceId, sessionId: "intruder-session", camera: "back" }),
    );
    await noMessage;

    intruderSocket.close();
    deviceSocket.close();

    // Same cleanup as the other ownership test -- don't leave a second
    // parent row around for any test added after this one.
    db.query(`DELETE FROM parents WHERE id = $id`).run({ $id: otherParentId });
  });
});
