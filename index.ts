import { appOptions } from "./server/app";
import { ensureSingleParent } from "./server/auth/bootstrap";

await ensureSingleParent();

const server = Bun.serve(appOptions);

console.log(`Server running at ${server.url}`);
