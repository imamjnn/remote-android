// Bun.password.hash()/verify() hang indefinitely on some minimal virtual CPUs
// (BoringSSL's SHA runtime dispatch spins instead of falling back). scrypt via
// node:crypto avoids that specific hang -- but only when pulled in via
// require(): a static ESM `import` of node:crypto eagerly binds the whole
// module namespace (including the broken SHA path) and hangs too, even
// though only scryptSync/randomBytes are actually used.
const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto") as typeof import("node:crypto");
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
