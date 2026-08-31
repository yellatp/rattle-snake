import { createHash, randomBytes } from "node:crypto";
import type { JobStore } from "../db/store.js";

/**
 * Session management (design plan R3): opaque 32-byte tokens; only the SHA-256
 * hash is persisted; 30-day sliding expiry is handled by the caller resetting
 * the cookie on activity. CSRF uses a separate token stored on the session row
 * and compared against the X-CSRF-Token header for cookie-authenticated
 * mutations.
 */

export const SESSION_COOKIE = "rs_session";
export const CSRF_COOKIE = "rs_csrf";
const SESSION_TTL_DAYS = 30;

export interface IssuedSession {
  rawToken: string;
  csrfToken: string;
  expiresAt: Date;
}

export function issueSession(store: JobStore, userId: string, orgId: string): IssuedSession {
  const rawToken = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const sessionIdHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  store.createSession({
    userId,
    orgId,
    sessionIdHash,
    csrfToken,
    expiresAt: expiresAt.toISOString(),
  });
  return { rawToken, csrfToken, expiresAt };
}

export function readSession(store: JobStore, rawToken: string | undefined): {
  userId: string;
  orgId: string;
  csrfToken: string;
} | null {
  if (!rawToken) return null;
  const session = store.getSession(sha256(rawToken));
  if (!session) return null;
  return { userId: session.userId, orgId: session.orgId, csrfToken: session.csrfToken };
}

export function revokeSession(store: JobStore, rawToken: string | undefined): void {
  if (!rawToken) return;
  store.deleteSession(sha256(rawToken));
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
