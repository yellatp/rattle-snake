/**
 * Functional test suite (pre-publish gate).
 *
 * Proves the whole committee pipeline works over REAL HTTP, not just in-process
 * mocks:
 *
 *   1. Provider wire-format E2E — runs the full pipeline (debate → blueprint →
 *      rewrite) through local fake LLM servers speaking the OpenAI-compatible,
 *      Anthropic Messages, and Gemini generateContent wire formats (PRD FR-6).
 *      No API keys required.
 *   2. HTTP API E2E — boots the real server on a port (mock provider), creates
 *      a job, polls to completion, reads the live SSE stream, checks /health.
 *
 * Run: pnpm --filter @rattlesnake/api e2e   (or: pnpm e2e from repo root)
 */
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, type ServerType } from "@hono/node-server";
import { getCommitteeForDomain, type JobState } from "@rattlesnake/shared";
import { runDebate } from "../src/committee/debateEngine.js";
import { extractBlueprint } from "../src/committee/blueprintExtractor.js";
import { generateSophisticatedResume } from "../src/resume/engine.js";
import { loadConfig } from "../src/config.js";
import { loadEnv } from "../src/env.js";
import { createLLMClient } from "../src/llm/client.js";
import { createApp } from "../src/app.js";
import { startFakeLLMServer, type FakeLLMKind } from "./fake-llm.js";

loadEnv();


const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jdPath = path.join(repoRoot, "samples", "fintech-jd.md");
const resumePath = path.join(repoRoot, "samples", "candidate-resume.md");

const LLM_ENV_KEYS = [
  "LLM_PROVIDER",
  "LLM_BASE_URL",
  "LLM_API_KEY",
  "LLM_MODEL",
  "LLM_TEMPERATURE",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "DEEPSEEK_API_KEY",
  "MOONSHOT_API_KEY",
  "XAI_API_KEY",
  "GROQ_API_KEY",
  "DASHSCOPE_API_KEY",
  "OPENROUTER_API_KEY",
] as const;

function resetLlmEnv(): void {
  for (const key of LLM_ENV_KEYS) delete process.env[key];
}

let failures = 0;
function check(name: string, condition: boolean, detail = ""): void {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function pollUntil(
  url: string,
  predicate: (job: JobState) => boolean,
  timeoutMs = 30_000,
): Promise<JobState> {
  const deadline = Date.now() + timeoutMs;
  let last: JobState | null = null;
  while (Date.now() < deadline) {
    const res = await fetch(url);
    if (res.ok) {
      last = (await res.json()) as JobState;
      if (predicate(last)) return last;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for job at ${url}; last status=${last?.status}`);
}

async function readStreamUntil(res: Response, marker: string, timeoutMs = 30_000): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.includes(marker)) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return text;
}

async function wireFormatE2E(kind: FakeLLMKind, provider: string, serverUrl: string) {
  console.log(`\n── Provider wire-format: ${kind} (provider="${provider}") ──`);

  resetLlmEnv();
  process.env.LLM_PROVIDER = provider;
  process.env.LLM_BASE_URL = serverUrl;
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "fake-model";
  if (kind === "anthropic") process.env.ANTHROPIC_API_KEY = "test-key";
  if (kind === "google") process.env.GEMINI_API_KEY = "test-key";

  const config = loadConfig();
  const llm = createLLMClient(config);
  const jd = await readFile(jdPath, "utf-8");
  const resume = await readFile(resumePath, "utf-8");

  const job: JobState = {
    id: `func-${kind}-${Date.now()}`,
    domain: "SWE",
    jobDescription: jd,
    baseResume: resume,
    // Exercise the UK English variant on the wire-format path.
    jobLocation: "London, UK",
    transcript: [],
    status: "debating",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const agents = getCommitteeForDomain("SWE");
  const result = await runDebate(job, agents, llm, {
    crossTalkRounds: config.debate.crossTalkRounds,
    agentMaxRetries: config.debate.agentMaxRetries,
  });
  job.transcript = result.entries;
  job.finalVerdict = result.consensus;

  const blueprint = await extractBlueprint(job, job.transcript, llm);
  job.blueprint = blueprint;
  const rewritten = await generateSophisticatedResume(job, blueprint, llm);
  job.rewrittenResume = rewritten.markdown;
  job.rewrittenResumeJson = rewritten.json;
  job.resumeMeta = rewritten.meta;

  const entries = result.entries;
  const nonNeutral = entries.every(
    (e) => !e.decision || e.decision === "HIRE" || e.decision === "REJECT",
  );
  const decisions = entries.filter((e) => e.decision).length;

  check("debate transcript has all 20 rounds (5 open + 10 cross-talk + 5 ballot)", entries.length === 20, `got ${entries.length}`);
  check("no neutral-verdict escapes (non-neutrality enforced)", nonNeutral, `decisions=${decisions}`);
  check("consensus is non-neutral (SHORTLISTED expected from fixture)", result.consensus === "SHORTLISTED", String(result.consensus));
  check("weighted tallies reported", result.tallies.HIRE > 0 && result.tallies.REJECT >= 0);
  check("ballot cast by all agents", Object.keys(result.ballot).length === agents.length);
  check("blueprint has objections", blueprint.objections.length > 0, `objections=${blueprint.objections.length}`);
  check("blueprint has strengths + required changes", blueprint.strengths.length > 0 && blueprint.requiredChanges.length > 0);
  check("rewritten resume is markdown with heading", rewritten.markdown.startsWith("# "), `head=${rewritten.markdown.slice(0, 40).replace(/\n/g, " ")}`);
  check("rewritten resume keeps candidate identity", rewritten.markdown.includes("Rohan Mehta"));
  check("rewritten resume is structured JSON with sections", (() => {
    try {
      const parsed = JSON.parse(rewritten.json);
      return Boolean(parsed.contact?.name && parsed.sections?.experience);
    } catch {
      return false;
    }
  })());
  check("resume meta reports role + ATS + moderation", Boolean(
    rewritten.meta.role && typeof rewritten.meta.atsScore === "number" && typeof rewritten.meta.moderationScore === "number",
  ));
  check("resume meta honours the job's location (UK English)", rewritten.meta.locale === "uk", `locale=${rewritten.meta.locale}`);
}

async function main() {
  console.log("=== Rattle-Snake V2 functional test suite ===\n");

  const fakeOpenAI = await startFakeLLMServer("openai", 9801);
  const fakeAnthropic = await startFakeLLMServer("anthropic", 9802);
  const fakeGoogle = await startFakeLLMServer("google", 9803);

  try {
    // 1. Provider wire-format E2E over real HTTP
    await wireFormatE2E("openai", "my-gateway", fakeOpenAI.url);
    await wireFormatE2E("anthropic", "anthropic", fakeAnthropic.url);
    await wireFormatE2E("google", "google", fakeGoogle.url);

    console.log(`\n  fake servers served requests — openai=${fakeOpenAI.requests} anthropic=${fakeAnthropic.requests} google=${fakeGoogle.requests}`);
    check("each fake provider served >= 22 pipeline calls over HTTP", fakeOpenAI.requests >= 22 && fakeAnthropic.requests >= 22 && fakeGoogle.requests >= 22);

    // 2. HTTP API E2E (real server on a port, real OpenAI-compatible HTTP
    //    provider slowed to 120ms/call so the live SSE stream is observable).
    console.log("\n── HTTP API + SSE E2E (slow fake OpenAI-compatible provider) ──");

    const fakeSlow = await startFakeLLMServer("openai", 9804, 120);

    resetLlmEnv();
    process.env.LLM_PROVIDER = "my-gateway";
    process.env.LLM_BASE_URL = fakeSlow.url;
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_MODEL = "fake-model";
    const tempDir = mkdtempSync(path.join(tmpdir(), "rattle-e2e-"));
    const dbPath = path.join(tempDir, "e2e.db");
    process.env.DATABASE_PATH = dbPath;

    const { app, store, llm } = createApp();
    const server: ServerType = serve({ fetch: app.fetch, port: 9877 });
    const base = "http://127.0.0.1:9877";

    try {
      const health = (await (await fetch(`${base}/health`)).json()) as { llm?: { provider?: string } };
      check("GET /health reports HTTP provider", health.llm?.provider === "my-gateway", JSON.stringify(health));

      const jd = await readFile(jdPath, "utf-8");
      const resume = await readFile(resumePath, "utf-8");
      const createdRes = await fetch(`${base}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription: jd,
          baseResume: resume,
          domain: "SWE",
          sectorFocus: "FinTech payments",
          location: "New York, USA",
        }),
      });
      check("POST /api/jobs returns 202", createdRes.status === 202, `got ${createdRes.status}`);
      const created = (await createdRes.json()) as JobState;
      check("POST /api/jobs persists job location", created.jobLocation === "New York, USA", `loc=${created.jobLocation}`);

      // Connect to SSE immediately so we capture the live debate + done event.
      const ssePromise = readStreamUntil(
        await fetch(`${base}/api/jobs/${created.id}/stream`),
        "event: done",
        45_000,
      );

      const job = await pollUntil(
        `${base}/api/jobs/${created.id}`,
        (j) => j.status === "completed" || j.status === "failed",
        45_000,
      );

      check("job reached completed", job.status === "completed", String(job.status));
      check("job has verdict + blueprint + rewritten resume", Boolean(job.finalVerdict && job.blueprint && job.rewrittenResume));
      check("US-located job produced US English resume", job.resumeMeta?.locale === "us", `locale=${job.resumeMeta?.locale}`);

      const listRes = (await (await fetch(`${base}/api/jobs`)).json()) as { jobs: JobState[] };
      check("GET /api/jobs lists the evaluation", listRes.jobs.length >= 1, `count=${listRes.jobs.length}`);

      const sseText = await ssePromise;
      check("SSE stream carried live entries (real HTTP provider)", sseText.includes("event: entry"), `bytes=${sseText.length}`);
      check("SSE stream delivered live done event", sseText.includes("event: done"));
      check("fake provider received >= 22 requests through the API server", fakeSlow.requests >= 22, `requests=${fakeSlow.requests}`);

      const del = await fetch(`${base}/api/jobs/${created.id}`, { method: "DELETE" });
      check("DELETE /api/jobs/:id returns 204", del.status === 204, `got ${del.status}`);

      console.log(`\n  API LLM client: ${llm.provider}/${llm.model}`);
      console.log(`  Final verdict: ${job.finalVerdict} · transcript ${job.transcript.length} entries`);
    } finally {
      server.close();
      store.close();
      rmSync(tempDir, { recursive: true, force: true });
      await fakeSlow.close();
    }
  } finally {
    await fakeOpenAI.close();
    await fakeAnthropic.close();
    await fakeGoogle.close();
  }

  console.log(`\n${failures === 0 ? "✓ ALL FUNCTIONAL TESTS PASSED" : `✗ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\n✗ Functional test suite crashed:", err);
  process.exit(1);
});
