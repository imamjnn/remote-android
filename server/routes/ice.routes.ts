import { getIceServers } from "../lib/ice";

// No auth: STUN/TURN server addresses aren't sensitive on their own (this
// deployment defaults to public STUN with no credentials), and both the
// unauthenticated child app and the parent dashboard need this before
// they've done anything else. If a TURN server with static credentials is
// added later, revisit this.
export const iceRoutes = {
  "/api/ice-servers": {
    GET: () => Response.json({ iceServers: getIceServers() }),
  },
};
