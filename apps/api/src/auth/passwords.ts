import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Account password hashing (design plan R3). Format: scrypt-auth$<N>$<salt b64>$<hash b64>.
 * Distinct versioned prefix from profile PINs so the two hashes never collide
 * in meaning; per-hash random salt; comparison via timingSafeEqual.
 */

const AUTH_ITERATIONS = 16_384;
// This Node/OpenSSL build rejects N=32768 even with raised maxmem; 16384 with
// a per-hash salt matches the OWASP interactive-authentication recommendation.
const SCRYPT_MAXMEM = 96 * 1024 * 1024;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 32, { N: AUTH_ITERATIONS, maxmem: SCRYPT_MAXMEM });
  return `scrypt-auth$${AUTH_ITERATIONS}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, iterations, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt-auth" || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const derived = scryptSync(password, salt, expected.length, {
    N: Number(iterations) || AUTH_ITERATIONS,
    maxmem: SCRYPT_MAXMEM,
  });
  return timingSafeEqual(derived, expected);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
