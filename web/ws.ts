import type { ParentWSMessage } from "./types";

export interface ParentSocket {
  send: (message: Record<string, unknown>) => void;
  disconnect: () => void;
}

export function connectParentSocket(onMessage: (msg: ParentWSMessage) => void): ParentSocket {
  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;

  function connect() {
    if (stopped) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/ws/parent`);

    socket.addEventListener("open", () => {
      attempt = 0;
    });

    socket.addEventListener("message", (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        // ignore malformed messages
      }
    });

    socket.addEventListener("close", scheduleReconnect);
    socket.addEventListener("error", () => socket?.close());
  }

  function scheduleReconnect() {
    if (stopped) return;
    attempt += 1;
    const delay = Math.min(1000 * 2 ** attempt, 30_000);
    setTimeout(connect, delay);
  }

  connect();

  return {
    send(message: Record<string, unknown>) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    disconnect() {
      stopped = true;
      socket?.close();
    },
  };
}
