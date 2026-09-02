import type { ServerWebSocket } from "bun";
import dashboard from "../web/index.html";
import { authRoutes } from "./routes/auth.routes";
import { devicesRoutes } from "./routes/devices.routes";
import { locationsRoutes } from "./routes/locations.routes";
import { iceRoutes } from "./routes/ice.routes";
import { upgradeParent, parentWs } from "./ws/parent.ws";
import { upgradeDevice, deviceWs } from "./ws/device.ws";
import type { WSData } from "./ws/types";

export const appOptions = {
  routes: {
    "/": dashboard,

    ...authRoutes,
    ...devicesRoutes,
    ...locationsRoutes,
    ...iceRoutes,

    "/ws/parent": upgradeParent,
    "/ws/device": upgradeDevice,
  },

  websocket: {
    data: {} as WSData,

    open(ws: ServerWebSocket<WSData>) {
      if (ws.data.kind === "parent") parentWs.open(ws);
      else deviceWs.open(ws);
    },

    message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
      if (ws.data.kind === "parent") parentWs.message(ws, message);
      else deviceWs.message(ws, message);
    },

    close(ws: ServerWebSocket<WSData>) {
      if (ws.data.kind === "parent") parentWs.close(ws);
      else deviceWs.close(ws);
    },
  },

  error(error: Error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  },
};
