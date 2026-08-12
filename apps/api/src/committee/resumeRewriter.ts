import {
  buildResumeRewriterPrompt,
  type Blueprint,
  type JobState,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/client.js";

/**
 * Rewrites the base resume so every committee objection is resolved.
 * Takes the Blueprint + full transcript as the driver; output is Markdown.
 */
export async function rewriteResume(
  job: JobState,
  blueprint: Blueprint,
  llm: LLMClient,
): Promise<string> {
  const prompt = buildResumeRewriterPrompt(
    { jobDescription: job.jobDescription, baseResume: job.baseResume, domain: job.domain },
    job.transcript,
    JSON.stringify(blueprint, null, 2),
  );

  const resume = await llm.complete(
    prompt,
    "Produce the rewritten resume in Markdown. Do not include any preamble.",
    { temperature: 0.3, maxTokens: 4000 },
  );

  return stripPreamble(resume);
}

function stripPreamble(text: string): string {
  const lines = text.trim().split("\n");
  const preambleRe =
    /^(here(\s|')|sure|below|following|attached|rewritten|optimized|certainly|okay|absolutely|definitely|let me|as requested)/i;
  while (
    lines.length > 0 &&
    (lines[0]!.trim().length === 0 ||
      preambleRe.test(lines[0]!.trim()) ||
      /:\s*$/.test(lines[0]!.trim()))
  ) {
    lines.shift();
  }
  return lines.join("\n").trim();
}
