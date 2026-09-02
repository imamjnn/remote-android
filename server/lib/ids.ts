export function newId(): string {
  return crypto.randomUUID();
}

export function newPairingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function newDeviceToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}
