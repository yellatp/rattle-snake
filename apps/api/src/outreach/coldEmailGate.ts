/**
 * Deterministic voice gate for the v2 cold-email content engine (design plan
 * R1). Cheap mechanical checks that enforce the non-negotiable voice rules
 * before a draft is accepted; on failure the caller regenerates exactly once
 * with the violation list, then falls back to the deterministic template.
 */

export interface ColdEmailGateInput {
  subject: string;
  body: string;
  cta: string;
}

export interface ColdEmailGateResult {
  passed: boolean;
  violations: string[];
}

const BANNED_OPENERS = [
  "i am writing",
  "i'm writing",
  "please find attached",
  "i came across your",
  "i hope this email finds you",
  "allow me to introduce",
];

const TECH_WORD_PATTERN =
  /\b(?:Kubernetes|Docker|Kafka|Postgres(?:QL)?|MongoDB|Redis|Elasticsearch|AWS|GCP|Azure|Terraform|React|Angular|Vue|Node\.?js|TypeScript|JavaScript|Python|Java|Golang|GraphQL|gRPC|Microservices?|CI\/CD|LLMs?|OpenAI|Distributed Systems?|Event-Driven)\b/g;

const METRIC_PATTERN = /\b\d+(?:\.\d+)?\s*(?:%|x|k\b|m\b|million|billion|\+)/gi;

const TYPOGRAPHY_PATTERN = /[\u2014\u2013\u201C\u201D\u2018\u2019]/;

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function runColdEmailGate(input: ColdEmailGateInput): ColdEmailGateResult {
  const violations: string[] = [];
  const body = input.body.trim();
  const subject = input.subject.trim();
  const cta = input.cta.trim();
  const lowerBody = body.toLowerCase();

  const wordCount = words(body).length;
  if (wordCount < 60 || wordCount > 170) {
    violations.push(`Body must be 60-170 words (got ${wordCount}).`);
  }

  if (subject.length > 70) {
    violations.push(`Subject must be 70 characters or fewer (got ${subject.length}).`);
  }

  if (!/\b(?:i|i'm|i've|my|me)\b/i.test(body)) {
    violations.push("Body must be written in the first person (missing \"I\"/\"my\").");
  }
  if (/\bthe candidate\b/i.test(lowerBody)) {
    violations.push("Body must never refer to the candidate in the third person.");
  }

  // The opener is the first non-greeting LINE (a "Hi," line ends with a comma,
  // so sentence splitting keeps it glued to the first real sentence).
  const opener =
    body
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !/^hi\b[,.!\s]*$/i.test(l))
      ?.toLowerCase() ?? "";
  for (const banned of BANNED_OPENERS) {
    if (opener.startsWith(banned)) {
      violations.push(`Banned opener: the email must not open with "${banned}".`);
      break;
    }
  }

  for (const sentence of sentences(body)) {
    const techCount = [...sentence.matchAll(TECH_WORD_PATTERN)].length;
    if (techCount > 2) {
      violations.push(
        "Too many named technologies in one sentence; capabilities over stack lists.",
      );
      break;
    }
  }

  const metricCount = [...body.matchAll(METRIC_PATTERN)].length;
  if (metricCount > 1) {
    violations.push(
      `At most one number is allowed in the body (found ${metricCount}); talk about impact, not achievement metrics.`,
    );
  }

  if (!/\b(?:call|chat|reply|talk|coffee|15|connect|time)\b/i.test(cta)) {
    violations.push("The ask (cta) must be a clear, low-friction request for a call, chat, or reply.");
  }

  if (!body.toLowerCase().includes(cta.toLowerCase().slice(0, 30))) {
    violations.push("The ask (cta) must appear verbatim at the end of the body.");
  }

  for (const [label, text] of [["subject", subject], ["body", body]] as const) {
    if (TYPOGRAPHY_PATTERN.test(text)) {
      violations.push(`${label} contains em-dashes or smart quotes; plain ASCII punctuation only.`);
    }
  }

  return { passed: violations.length === 0, violations };
}
