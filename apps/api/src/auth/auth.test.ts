import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { JobStore } from "../db/store.js";
import { hashPassword, isValidEmail, verifyPassword } from "./passwords.js";
import { issueSession, readSession, revokeSession } from "./sessions.js";
import { createApp } from "../app.js";

describe("auth.passwords", () => {
  it("round-trips a password and rejects wrong ones", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces different hashes for the same password (random salt)", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("validates email shape", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});

describe("auth.sessions", () => {
  let tmp: string;
  let store: JobStore;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "rsnake-auth-"));
    store = new JobStore(path.join(tmp, "auth.db"));
    store.ensureDefaultOrg();
  });

  afterEach(() => {
    store.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("issues, reads, and revokes sessions", () => {
    const issued = issueSession(store, "usr_1", "org_1");
    const session = readSession(store, issued.rawToken);
    expect(session?.userId).toBe("usr_1");
    expect(session?.orgId).toBe("org_1");
    revokeSession(store, issued.rawToken);
    expect(readSession(store, issued.rawToken)).toBeNull();
  });

  it("rejects unknown and garbage tokens", () => {
    expect(readSession(store, undefined)).toBeNull();
    expect(readSession(store, "garbage")).toBeNull();
  });
});

describe("auth API flow", () => {
  let tmp: string;
  let ctx: ReturnType<typeof createApp>;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "rsnake-authapi-"));
    process.env.LLM_PROVIDER = "mock";
    process.env.DATABASE_PATH = path.join(tmp, "auth.db");
    process.env.EXPORTS_DIR = path.join(tmp, "exports");
    ctx = createApp();
  });

  afterEach(() => {
    ctx.store.close();
    delete process.env.LLM_PROVIDER;
    delete process.env.DATABASE_PATH;
    delete process.env.EXPORTS_DIR;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("registers, reads me, logs out, and logs back in", async () => {
    const register = await ctx.app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "User@Example.com", password: "longenough1", name: "Prudh" }),
    });
    expect(register.status).toBe(201);
    const setCookie = register.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("rs_session=");

    const cookie = setCookie.split(",")[0]!.split(";")[0]!;

    const me = await ctx.app.request("/api/auth/me", {
      headers: { cookie },
    });
    const meBody = (await me.json()) as { authenticated: boolean; role?: string };
    expect(meBody.authenticated).toBe(true);
    expect(meBody.role).toBe("owner");

    const logout = await ctx.app.request("/api/auth/logout", {
      method: "POST",
      headers: { cookie },
    });
    expect(logout.status).toBe(200);

    const meAfter = await ctx.app.request("/api/auth/me", { headers: { cookie } });
    const after = (await meAfter.json()) as { authenticated: boolean };
    expect(after.authenticated).toBe(false);

    const login = await ctx.app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "longenough1" }),
    });
    expect(login.status).toBe(200);
    const loginBody = (await login.json()) as { authenticated: boolean; orgId?: string };
    expect(loginBody.authenticated).toBe(true);
    expect(loginBody.orgId).toBeTruthy();
  });

  it("rejects duplicate registration and wrong passwords", async () => {
    const first = await ctx.app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dup@example.com", password: "longenough1" }),
    });
    expect(first.status).toBe(201);

    const dupe = await ctx.app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dup@example.com", password: "longenough1" }),
    });
    expect(dupe.status).toBe(400);

    const bad = await ctx.app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dup@example.com", password: "wrongpassword" }),
    });
    expect(bad.status).toBe(401);
  });

  it("keeps unauthenticated API access working while the auth flag is off", async () => {
    const res = await ctx.app.request("/api/jobs");
    expect(res.status).toBe(200);
  });

  it("protects API routes when REQUIRE_AUTH is on (session works, anonymous 401)", async () => {
    ctx.store.close();
    process.env.REQUIRE_AUTH = "true";
    process.env.DATABASE_PATH = path.join(tmp, "auth2.db");
    ctx = createApp();

    const anon = await ctx.app.request("/api/jobs");
    expect(anon.status).toBe(401);

    const register = await ctx.app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "strict@example.com", password: "longenough1" }),
    });
    expect(register.status).toBe(201);
    const cookie = (register.headers.get("set-cookie") ?? "").split(",")[0]!.split(";")[0]!;

    const jobs = await ctx.app.request("/api/jobs", { headers: { cookie } });
    expect(jobs.status).toBe(200);
    delete process.env.REQUIRE_AUTH;
  });

  it("enforces CSRF on cookie-authenticated mutations", async () => {
    const register = await ctx.app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "csrf@example.com", password: "longenough1" }),
    });
    const rawCookie = register.headers.get("set-cookie") ?? "";
    const sessionCookie = rawCookie.split(",")[0]!.split(";")[0]!;
    const csrfMatch = rawCookie.match(/rs_csrf=([^;]+)/);
    const csrfToken = csrfMatch?.[1] ?? "";

    const longContent = "Experienced backend engineer with production ownership of distributed systems, Kafka pipelines, and on-call reliability work at scale.";
    const withoutHeader = await ctx.app.request("/api/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({ title: "Test resume", content: longContent }),
    });
    expect(withoutHeader.status).toBe(403);

    const withHeader = await ctx.app.request("/api/resumes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${sessionCookie}; rs_csrf=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ title: "Test resume", content: longContent }),
    });
    expect(withHeader.status).toBe(201);
  });
});
