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
  // sha256/sha1/etc via Bun.CryptoHasher hang forever on some minimal virtual
  // CPUs (BoringSSL SHA dispatch bug); md5 doesn't hit that path. Fine here
  // since the input is already a full-entropy random token, not a password.
  return new Bun.CryptoHasher("md5").update(token).digest("hex");
}
