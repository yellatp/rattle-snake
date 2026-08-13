/**
 * Offline / headless debate runner.
 *
 * Usage (from repo root):
 *   pnpm debate -- --jd samples/jd.md --resume samples/resume.md --domain SWE [--mock] [--out out.md]
 *
 * Reads the JD + resume from files, runs the full committee pipeline, prints
 * the transcript + verdict + blueprint, and (optionally) writes the rewritten
 * resume to --out. Uses the same code path as the HTTP API.
 */
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { getCommitteeForDomain, type JobState } from "@rattlesnake/shared";
import { createLLMClient } from "../src/llm/client.js";
import { runDebate } from "../src/committee/debateEngine.js";
import { extractBlueprint } from "../src/committee/blueprintExtractor.js";
import { generateSophisticatedResume } from "../src/resume/engine.js";
import { loadEnv } from "../src/env.js";
import { loadConfig } from "../src/config.js";

loadEnv();

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  console.error(usage);
  process.exit(1);
}

const usage = `Usage: pnpm debate -- --jd <file> --resume <file> [--domain SWE|DATA_AI|FINANCE] [--mock] [--out <file>]`;

const { values } = parseArgs({
  options: {
    jd: { type: "string" },
    resume: { type: "string" },
    domain: { type: "string" },
    out: { type: "string" },
    mock: { type: "boolean", default: false },
  },
});

if (!values.jd || !values.resume) fail("--jd and --resume are required");

const domain = (values.domain ?? "SWE") as JobState["domain"];
if (!["SWE", "DATA_AI", "FINANCE"].includes(domain)) fail(`Unknown domain: ${domain}`);

const config = loadConfig();
if (values.mock) config.llm.provider = "mock";
const llm = createLLMClient(config);

// Resolve file args relative to the monorepo root so paths work from anywhere.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const resolveArg = (p: string) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));

const jobDescription = await readFile(resolveArg(values.jd), "utf-8");
const baseResume = await readFile(resolveArg(values.resume), "utf-8");

const job: JobState = {
  id: randomUUID(),
  domain,
  jobDescription,
  baseResume,
  transcript: [],
  status: "debating",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

console.log(`\nRunning ${domain} committee (${llm.provider}/${llm.model})...\n`);

const agents = getCommitteeForDomain(domain);
const result = await runDebate(job, agents, llm, {
  crossTalkRounds: config.debate.crossTalkRounds,
  agentMaxRetries: config.debate.agentMaxRetries,
  onEntry: (entry) => {
    const tag = entry.decision ? `  ➜ ${entry.decision}` : "";
    console.log(`\n[Round ${entry.round}] ${entry.sender} (${entry.role})${tag}`);
  },
});

job.transcript = result.entries;
job.finalVerdict = result.consensus;

console.log(`\n\n========== CONSENSUS: ${result.consensus} ==========`);
console.log(`Weighted tallies: HIRE=${result.tallies.HIRE.toFixed(1)}  REJECT=${result.tallies.REJECT.toFixed(1)}`);
for (const [agent, vote] of Object.entries(result.ballot)) {
  console.log(`  • ${agent}: ${vote}`);
}

console.log("\n\n========== HIRING COMMITTEE BLUEPRINT ==========");
const blueprint = await extractBlueprint(job, job.transcript, llm);
console.log(JSON.stringify(blueprint, null, 2));
job.blueprint = blueprint;

console.log("\n========== REWRITTEN RESUME ==========\n");
const rewritten = await generateSophisticatedResume(job, blueprint, llm);
job.rewrittenResume = rewritten.markdown;
job.rewrittenResumeJson = rewritten.json;
job.resumeMeta = rewritten.meta;
console.log(rewritten.markdown);
console.log(
  `\n[meta] role=${rewritten.meta.role} ATS=${rewritten.meta.atsScore} auditor=${rewritten.meta.moderationScore}/100 approved=${rewritten.meta.moderationApproved} iterations=${rewritten.meta.iterations}`,
);

if (values.out) {
  const outPath = resolveArg(values.out);
  mkdirSync(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, rewritten.markdown, "utf-8");
  console.log(`\nSaved rewritten resume to ${outPath}`);
}

console.log("\nDone.");
