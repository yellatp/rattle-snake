import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ALGO = "aes-256-gcm";

/**
 * Load (or create) the server's master secret used to encrypt LLM API keys at
 * rest. Stored next to the SQLite DB as a 0600 file — anyone with filesystem
 * access to the host can read it, but the raw keys never land in the DB or in
 * API responses.
 */
export function loadOrCreateSecret(dir: string): string {
  const secretPath = path.join(dir, ".secret");
  mkdirSync(dir, { recursive: true });
  if (existsSync(secretPath)) {
    const secret = readFileSync(secretPath, "utf8").trim();
    if (secret.length >= 32) return secret;
  }
  const secret = randomBytes(32).toString("hex");
  writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

function keyBytes(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** Encrypt a secret. Output format: `<iv>:<authTag>:<ciphertext>` (base64). */
export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyBytes(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** Decrypt a value produced by `encryptSecret`. */
export function decryptSecret(payload: string, secret: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = createDecipheriv(
    ALGO,
    keyBytes(secret),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** `sk-abc123...xyz` -> `sk-abc1…xyz`. Never returns the full key. */
export function maskKey(apiKey: string): string {
  if (apiKey.length <= 10) return `${apiKey.slice(0, 2)}…`;
  return `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`;
}
