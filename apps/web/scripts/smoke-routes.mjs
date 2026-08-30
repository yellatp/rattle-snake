/**
 * Route smoke test (WS-7): builds are assumed done; starts the standalone prod
 * server and asserts every sidebar page answers with its expected status and
 * that the legacy URLs (/ and /jobs and /debate) redirect appropriately.
 *
 * Run with: node scripts/smoke-routes.mjs  (after `astro build`)
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "..", "dist", "server", "entry.mjs");
const host = "127.0.0.1";
const port = 4329;
const base = `http://${host}:${port}`;

const routes = [
  ["/", 302], // legacy Home redirects to /dashboard
  ["/dashboard", 200],
  ["/sme-panel", 200],
  ["/resume", 200],
  ["/profile", 200],
  ["/storage", 200],
  ["/storage/smoke-id", 200],
  ["/exports", 302], // legacy URL redirects to /storage
  ["/settings", 200],
  ["/help", 200],
  ["/jobs", 302], // legacy URL redirects to /dashboard
  ["/jobs/smoke-id", 200], // detail page renders regardless of id
  ["/debate", 302], // legacy URL redirects to /sme-panel
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/`);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error("web server did not start on " + base);
}

const child = spawn(process.execPath, [serverPath], {
  env: { ...process.env, HOST: host, PORT: String(port) },
  stdio: ["ignore", "ignore", "pipe"],
});

let failed = false;
const exit = (code) => {
  child.kill();
  process.exit(code);
};

child.on("error", (err) => {
  console.error("failed to start server:", err.message);
  exit(1);
});

try {
  await waitForServer();

  for (const [route, expected] of routes) {
    const res = await fetch(`${base}${route}`, { redirect: "manual" });
    const ok = res.status === expected;
    console.log(`${ok ? "ok" : "FAIL"} ${route} -> ${res.status} (expected ${expected})`);
    if (!ok) failed = true;
  }

  // Follow the legacy /jobs redirect once and confirm it lands on /dashboard.
  const first = await fetch(`${base}/jobs`, { redirect: "manual" });
  const location = first.headers.get("location") ?? "";
  const landed = await fetch(`${base}${location}`);
  const ok = landed.status === 200 && location.includes("/dashboard");
  console.log(
    `${ok ? "ok" : "FAIL"} /jobs redirect location=${location} -> ${landed.status}`,
  );
  if (!ok) failed = true;
} catch (err) {
  console.error("smoke failed:", err.message);
  failed = true;
} finally {
  child.kill();
}

if (failed) exit(1);
console.log("ALL ROUTES SMOKE PASSED");
exit(0);
