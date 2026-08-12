import {
  blueprintSchema,
  buildBlueprintPrompt,
  type Blueprint,
  type JobState,
  type TranscriptEntry,
  type Verdict,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/client.js";

/**
 * Extracts the structured Hiring Committee Blueprint from the debate transcript.
 *
 * Strategy:
 *   1. LLM synthesis (best quality, uses the full context).
 *   2. Rule-based fallback parsing the strict agent OUTPUT FORMAT sections —
 *      works offline against the mock provider too.
 * Always validates/repairs against the shared Zod blueprint schema.
 */
export async function extractBlueprint(
  job: JobState,
  transcript: TranscriptEntry[],
  llm: LLMClient,
): Promise<Blueprint> {
  const llmResult = await extractViaLLM(job, transcript, llm).catch(() => null);
  if (llmResult) return llmResult;

  const ruleBased = extractViaRules(transcript, job.finalVerdict);
  return repairBlueprint(ruleBased);
}

async function extractViaLLM(
  job: JobState,
  transcript: TranscriptEntry[],
  llm: LLMClient,
): Promise<Blueprint | null> {
  const prompt = buildBlueprintPrompt(
    { jobDescription: job.jobDescription, baseResume: job.baseResume, domain: job.domain },
    transcript,
  );
  const raw = await llm.complete(prompt, "Produce the blueprint JSON only.", {
    temperature: 0.1,
    maxTokens: 2000,
  });
  const json = stripCodeFences(raw);
  const parsed = JSON.parse(json) as unknown;
  const validated = blueprintSchema.safeParse(parsed);
  if (!validated.success) return null;
  return repairBlueprint(validated.data);
}

function extractViaRules(
  transcript: TranscriptEntry[],
  consensus?: Verdict,
): Blueprint {
  const sectionRe = /\[(STRONG POSITIVES|HIGH-RISK CONCERNS|SECTOR & TRANSFERABILITY|PIVOT POINT)\]([\s\S]*?)(?=\[|$)/gi;
  const bullets = (block: string) =>
    block
      .split("\n")
      .map((l) => l.trim().replace(/^[-*•]\s*/, "").trim())
      .filter((l) => l.length > 8);

  const objections = new Set<string>();
  const strengths = new Set<string>();
  const sectorNotes = new Set<string>();
  const pivotFactors = new Set<string>();
  const verdicts: Record<string, "HIRE" | "REJECT"> = {};

  for (const entry of transcript) {
    if (entry.decision) verdicts[entry.sender] = entry.decision;
    for (const match of entry.text.matchAll(sectionRe)) {
      const section = match[1]!.toUpperCase();
      const content = match[2]!;
      const items = bullets(content);
      if (section === "STRONG POSITIVES") items.forEach((i) => strengths.add(i));
      if (section === "HIGH-RISK CONCERNS") items.forEach((i) => objections.add(i));
      if (section === "SECTOR & TRANSFERABILITY") items.forEach((i) => sectorNotes.add(i));
      if (section === "PIVOT POINT") items.forEach((i) => pivotFactors.add(i));
    }
  }

  const decisionRe = /\[STRONG\s+(HIRE|REJECT)\]/gi;
  for (const entry of transcript) {
    const decision = entry.text.match(decisionRe)?.[1];
    if (decision) verdicts[entry.sender] = decision.toUpperCase() as "HIRE" | "REJECT";
  }

  const requiredChanges = deriveRequiredChanges([...objections]);

  return {
    objections: [...objections],
    strengths: [...strengths],
    requiredChanges,
    sectorNotes: [...sectorNotes],
    pivotFactors: [...pivotFactors],
    verdicts,
    consensus: consensus ?? inferConsensus(verdicts),
  };
}

function deriveRequiredChanges(objections: string[]): string[] {
  const prefixes = [
    "Quantify with explicit ",
    "Add concrete evidence for ",
    "Reframe to lead with metrics for ",
    "Clarify ownership and scope for ",
    "Map transferable skills for ",
    "Address explicitly: ",
  ];
  return objections.map((o, i) => {
    const short = o.replace(/^[-*•\s]+/, "");
    return `${prefixes[i % prefixes.length]}${short.length > 140 ? `${short.slice(0, 137)}...` : short}`;
  });
}

function inferConsensus(verdicts: Record<string, "HIRE" | "REJECT">): Verdict {
  const entries = Object.values(verdicts);
  if (entries.length === 0) return "REJECTED";
  const hires = entries.filter((v) => v === "HIRE").length;
  return hires > entries.length / 2 ? "SHORTLISTED" : "REJECTED";
}

/** Guarantee every required field exists even when the source was sparse. */
function repairBlueprint(bp: Blueprint): Blueprint {
  return {
    objections: bp.objections ?? [],
    strengths: bp.strengths ?? [],
    requiredChanges: bp.requiredChanges ?? [],
    sectorNotes: bp.sectorNotes ?? [],
    pivotFactors: bp.pivotFactors ?? [],
    verdicts: bp.verdicts ?? {},
    consensus: bp.consensus ?? "REJECTED",
  };
}

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
}
