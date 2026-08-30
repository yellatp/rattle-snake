import {
  buildJobDecompositionPrompt,
  jobDecompositionSchema,
  type Domain,
  type JdMeta,
  type JobDecomposition,
} from "@rattlesnake/shared";
import type { LLMClient } from "../llm/client.js";

/**
 * Job decomposition (Phase 1, plan §5). Produces the structured role brief every
 * committee seat shares so the panel evaluates the candidate against the same
 * role model: the real level, the named screening filters, the exact stack, and
 * the company's actual near-term problems.
 *
 * Strategy (mirrors jdMetaExtractor / blueprintExtractor):
 *   1. LLM extraction via the job-decomposition prompt (best quality).
 *   2. Deterministic rule-based fallback (level/seniority from title and years,
 *      screening filters from explicit "not a ..." disclaimers, stack words from
 *      a lexicon, requirements/nice-to-haves from section bullets) — works
 *      offline against the mock provider.
 * Always validates/repairs against the shared Zod job-decomposition schema.
 */
export async function extractJobDecomposition(
  input: {
    jobDescription: string;
    domain: Domain;
    roleSlug?: string;
    jdMeta?: JdMeta;
  },
  llm: LLMClient,
): Promise<JobDecomposition> {
  const llmResult = await extractViaLLM(input, llm).catch((err) => {
    console.warn(`[pipeline] job-decomposition LLM extraction failed for ${input.roleSlug ?? "role"}; using rule-based fallback:`, err);
    return null;
  });
  if (llmResult) return llmResult;
  return extractViaRules(input);
}

async function extractViaLLM(
  input: { jobDescription: string; domain: Domain; roleSlug?: string; jdMeta?: JdMeta },
  llm: LLMClient,
): Promise<JobDecomposition | null> {
  const prompt = buildJobDecompositionPrompt(input);
  const raw = await llm.complete(prompt, "Produce the job-decomposition JSON only.", {
    temperature: 0.2,
    maxTokens: 900,
  });
  const json = stripCodeFences(raw);
  const parsed = JSON.parse(json) as unknown;
  const validated = jobDecompositionSchema.safeParse(parsed);
  if (!validated.success) return null;
  return repair(validated.data);
}

/**
 * Deterministic rule-based decomposition. Never throws and never invents facts:
 * it only derives what is structurally present in the JD (level words, year
 * ranges, "not a ..." disclaimers, a known stack-word lexicon, and bullets under
 * Requirements / Nice-to-have headings).
 */
export function extractViaRules(input: {
  jobDescription: string;
  domain: Domain;
  jdMeta?: JdMeta;
}): JobDecomposition {
  const text = input.jobDescription;
  const lower = text.toLowerCase();

  let level = "";
  for (const probe of [
    { re: /principal|staff/i, label: "Principal / Staff" },
    { re: /senior|sr\.?/i, label: "Senior" },
    { re: /\blead\b|manager|head of/i, label: "Lead / Manager" },
    { re: /junior|entry|associate/i, label: "Junior / Entry" },
  ]) {
    if (probe.re.test(lower)) {
      level = probe.label;
      break;
    }
  }

  let seniorityExpectation = "";
  const ranged = lower.match(/(\d+)\s*[-–]\s*(\d+)\s*(?:\+|plus\s*)?\s*years?/);
  const plus = lower.match(/(\d+)\s*\+?\s*years?\s*of\s+(?:professional\s+)?experience/);
  const bare = lower.match(/(\d+)\s*(?:\+|plus)\s*years/);
  if (ranged) seniorityExpectation = `${ranged[1]}-${ranged[2]} yrs`;
  else if (plus) seniorityExpectation = `${plus[1]}+ yrs`;
  else if (bare) seniorityExpectation = `${bare[1]}+ yrs`;

  const screeningFilters = [
    ...new Set(
      [...text.matchAll(/\b(?:not|no|never)\s+(?:a\s+)?([a-z][a-z /-]{2,40}(?:role|job|position|person))/gi)].map(
        (m) => m[0].trim().replace(/\s+/g, " ").toLowerCase(),
      ),
    ),
  ].slice(0, 4);

  const STACK_WORDS = [
    "typescript", "javascript", "java", "python", "go", "rust", "c++", "c#", "kotlin", "swift",
    "sql", "pandas", "pyspark", "spark", "flink", "snowflake", "bigquery", "redshift",
    "airflow", "dbt", "databricks", "hadoop", "kafka", "rabbitmq", "redis", "postgresql",
    "postgres", "mysql", "mongodb", "dynamodb", "elasticsearch", "react", "next.js", "node.js",
    "node", "django", "flask", "fastapi", "spring", "pytorch", "tensorflow", "scikit-learn",
    "kubernetes", "docker", "terraform", "aws", "gcp", "azure", "jenkins", "grafana",
    "prometheus", "git", "ci/cd", "helm", "nginx", "istio",
  ];
  const stackWords = [...new Set(STACK_WORDS.filter((s) => lower.includes(s)))];

  const mustHave = dedupe(
    extractSectionBullets(text, ["must have", "requirements", "qualifications", "what you'll bring", "what you will bring"]),
  ).slice(0, 12);
  const niceToHave = dedupe(
    extractSectionBullets(text, ["nice to have", "preferred", "bonus", "a plus", "beneficial", "good to have"]),
  ).slice(0, 12);

  const domainConstraints: string[] = [];
  if (/health|claim|insurance|hipaa|medical|clinical/i.test(lower)) {
    domainConstraints.push("healthcare / claims context");
  }
  if (/complian|regulat|gdpr|soc ?2|sox|iso 27001|pci/i.test(lower)) {
    domainConstraints.push("compliance / regulation");
  }
  if (/payment|payments|pci|card|fintech|banking|ledger/i.test(lower)) {
    domainConstraints.push("payments / fintech");
  }

  return repair({
    level,
    seniorityExpectation,
    screeningFilters,
    mustHave,
    niceToHave,
    stackWords,
    businessProblems: [],
    domainConstraints,
    businessContext: input.jdMeta?.sector ?? "",
  });
}

/** Bullets collected from JD sections headed by one of `headers`. */
function extractSectionBullets(text: string, headers: string[]): string[] {
  const lines = text.split("\n").map((l) => l.trim());
  const bullets: string[] = [];
  let active = false;
  for (const line of lines) {
    if (!line) continue;
    if (headers.some((h) => line.toLowerCase().startsWith(h) || line.toLowerCase().includes(h))) {
      active = true;
      continue;
    }
    if (active) {
      if (/^[A-Z][A-Z\s&\-/:]{3,}:?$/i.test(line) && line.length < 60) {
        active = false;
        continue;
      }
      const bullet = line.replace(/^[-•*·]\s*/, "").replace(/\s+/g, " ").trim();
      if (bullet.length > 4) bullets.push(bullet);
    }
  }
  return bullets;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((i) => i.toLowerCase()).filter(Boolean))];
}

/** Guarantee every required field exists even when the source was sparse. */
function repair(d: JobDecomposition): JobDecomposition {
  return {
    level: d.level ?? "",
    seniorityExpectation: d.seniorityExpectation ?? "",
    screeningFilters: d.screeningFilters ?? [],
    mustHave: d.mustHave ?? [],
    niceToHave: d.niceToHave ?? [],
    stackWords: d.stackWords ?? [],
    businessProblems: d.businessProblems ?? [],
    domainConstraints: d.domainConstraints ?? [],
    businessContext: d.businessContext ?? "",
  };
}

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
}
