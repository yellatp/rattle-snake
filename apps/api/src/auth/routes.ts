import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AuditLogger } from "../audit/logger.js";
import type { JobStore } from "../db/store.js";
import { hashPassword, isValidEmail, verifyPassword } from "./passwords.js";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  issueSession,
  readSession,
  revokeSession,
} from "./sessions.js";

const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_WINDOW_MS = 5 * 60 * 1_000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function loginThrottled(ip: string): boolean {
  const entry = loginAttempts.get(ip);
  const now = Date.now();
  if (!entry || now >= entry.resetAt) return false;
  return entry.count >= LOGIN_ATTEMPT_LIMIT;
}

function recordLoginAttempt(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function setSessionCookies(
  c: { res: { headers: { append: (name: string, value: string) => void } } },
  raw: string,
  csrf: string,
): void {
  const maxAge = 30 * 24 * 60 * 60;
  c.res.headers.append("Set-Cookie", `${SESSION_COOKIE}=${raw}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`);
  c.res.headers.append("Set-Cookie", `${CSRF_COOKIE}=${csrf}; Path=/; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearSessionCookies(c: { res: { headers: { append: (name: string, value: string) => void } } }): void {
  c.res.headers.append("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  c.res.headers.append("Set-Cookie", `${CSRF_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`);
}

const credentialsSchema = z.object({
  email: z.string().min(3).max(200),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120).optional(),
});

export function createAuthRouter(store: JobStore, config: AppConfig, auditLogger?: AuditLogger) {
  const router = new Hono();

  function audit(
    c: { req: { header: (n: string) => string | undefined } },
    action: Parameters<AuditLogger["log"]>[0]["action"],
    outcome: Parameters<AuditLogger["log"]>[0]["outcome"],
    message: string,
    email?: string,
  ) {
    if (!auditLogger) return;
    auditLogger.log({
      timestamp: new Date().toISOString(),
      action,
      tenantId: "default",
      ip: clientIp(c),
      outcome,
      message,
      metadata: email ? { email } : undefined,
    });
  }

  function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
    const forwarded = c.req.header("x-forwarded-for");
    if (config.security.trustProxy && forwarded) return forwarded.split(",")[0]!.trim();
    return "unknown";
  }

  function readCookie(c: { req: { header: (n: string) => string | undefined } }, name: string): string | undefined {
    const cookieHeader = c.req.header("cookie");
    if (!cookieHeader) return undefined;
    for (const part of cookieHeader.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === name) return rest.join("=");
    }
    return undefined;
  }

  router.get("/me", (c) => {
    const session = readSession(store, readCookie(c, SESSION_COOKIE));
    if (!session) return c.json({ authenticated: false });
    const role = store.getMembershipRole(session.userId, session.orgId);
    return c.json({ authenticated: true, userId: session.userId, orgId: session.orgId, role });
  });

  router.post("/register", zValidator("json", credentialsSchema), (c) => {
    const body = c.req.valid("json");
    if (!isValidEmail(body.email)) {
      return c.json({ error: "Enter a valid email address." }, 400);
    }
    try {
      const user = store.createUser({
        email: body.email,
        name: body.name ?? body.email.split("@")[0]!,
        passwordHash: hashPassword(body.password),
      });
      const orgId = store.createOrgWithOwner(user.id, `${user.name}'s workspace`);
      const session = issueSession(store, user.id, orgId);
      setSessionCookies(c, session.rawToken, session.csrfToken);
      audit(c, "auth.registered", "success", "Account created", user.email);
      return c.json({ authenticated: true, userId: user.id, orgId, role: "owner" }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      audit(c, "auth.registered", "failure", message, body.email);
      return c.json({ error: message }, 400);
    }
  });

  router.post("/login", zValidator("json", credentialsSchema), (c) => {
    const ip = clientIp(c);
    if (loginThrottled(ip)) {
      audit(c, "auth.login_failed", "denied", "Too many login attempts");
      return c.json({ error: "Too many attempts. Try again in a few minutes." }, 429);
    }
    const body = c.req.valid("json");
    const user = store.getUserByEmail(body.email);
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      recordLoginAttempt(ip);
      audit(c, "auth.login_failed", "denied", "Invalid credentials", body.email);
      return c.json({ error: "Invalid email or password." }, 401);
    }
    const orgId = store.getFirstOrgIdForUser(user.id);
    if (!orgId) {
      return c.json({ error: "No workspace found for this account." }, 400);
    }
    const session = issueSession(store, user.id, orgId);
    setSessionCookies(c, session.rawToken, session.csrfToken);
    audit(c, "auth.login", "success", "Signed in", user.email);
    return c.json({
      authenticated: true,
      userId: user.id,
      orgId,
      role: store.getMembershipRole(user.id, orgId),
    });
  });

  router.post("/logout", (c) => {
    const raw = readCookie(c, SESSION_COOKIE);
    const session = readSession(store, raw);
    revokeSession(store, raw);
    clearSessionCookies(c);
    if (session) audit(c, "auth.logout", "success", "Signed out");
    return c.json({ ok: true });
  });

  return router;
}
