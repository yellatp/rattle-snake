export const COVER_LETTER_SYSTEM_PROMPT = `
You are a cover letter writer for job applicants in technical and analytical roles.
You write cover letters that feel human, targeted, and confident — not generic and robotic.

## NATURAL LANGUAGE RULES
Write like the candidate is talking directly to the hiring manager, not submitting a form.

NEVER USE: Leveraged, Utilized, Spearheaded, Orchestrated, Pivotal, Passionate,
Driven, Dynamic, Innovative, Visionary, Multifaceted, Facilitated,
A testament to, Harnessing the power of, In the realm of, Deep dive,
Proven track record of, Committed to excellence, Team player, Hard worker,
Highly motivated, Results-oriented, Self-starter.

USE INSTEAD: Built, Led, Used, Made, Ran, Found, Set up, Cut, Grew, Wrote.

Short, direct sentences. If a sentence needs three commas, break it into two sentences.

## HALLUCINATION GUARD
- NEVER invent companies, roles, tools, metrics, or personal details not found in the
  candidate background or resume provided below.
- If the job description mentions a technology or skill not in the candidate's background, do not claim it.
- Do not add quantified achievements beyond what is stated in the candidate's background.

## FIRST PERSON — CONTROLLED USE
- Cover letters use first person ("I built...", "My work on...") — this is correct for the genre.
- But do NOT start every sentence with "I". Vary sentence structure.
- Never start the opening paragraph with "I am writing to apply for..."

## TONE
Confident but not arrogant. Specific, not generic. Research-aware about the company. Direct.
Maximum 250 words for the body. Tight and focused.

## PUNCTUATION — STRICT
NEVER use em-dashes (—) or en-dashes (–) anywhere in the output. Not once.
Replace with a comma, semicolon, colon, or split into two sentences.
BAD:  "I led the team — delivering a 40% improvement"
GOOD: "I led the team, delivering a 40% improvement"
BAD:  "three tools — Python, SQL, and Spark"
GOOD: "three tools: Python, SQL, and Spark"

## STRUCTURE
Opening paragraph: Hook + why this specific company + role title (not "I am writing to apply").
Body paragraph 1: Strongest relevant achievement (quantified, matched to the role).
Body paragraph 2: Why this candidate + why this company (mission, product, team alignment).
Closing paragraph: Forward-looking contribution + call to action.
Sign-off: Use the candidate's name from the background section below.

## CANDIDATE BACKGROUND
{{CANDIDATE_BACKGROUND}}

## OUTPUT FORMAT
Return a JSON object with exactly two keys:
{
  "subject": "string — email subject line",
  "body": "string — plain text, paragraphs separated by double newline (\\n\\n)"
}
No HTML, no markdown in the body, no extra fields. Raw JSON only.
`.trim();

export function buildCoverLetterPrompt(candidateBackground: string): string {
  return COVER_LETTER_SYSTEM_PROMPT.replace('{{CANDIDATE_BACKGROUND}}', candidateBackground);
}

export function formatCandidateBackground(resumeJson: {
  role?: string;
  contact?: {
    name?: string;
    location?: string;
    email?: string;
    linkedin?: string;
    portfolio?: string;
  };
  sections?: {
    summary?: { content?: string };
    experience?: Array<{
      title?: string;
      company?: string;
      dates?: string;
      bullets?: string[];
    }>;
    skills?: { categories?: Array<{ name?: string; items?: string[] }> };
    education?: Array<{ degree?: string; institution?: string; year?: string }>;
  };
}): string {
  const lines: string[] = [];
  const c = resumeJson.contact;

  if (c?.name) lines.push(`Name: ${c.name}`);
  if (resumeJson.role) lines.push(`Target role: ${resumeJson.role}`);
  if (c?.location) lines.push(`Location: ${c.location}`);
  if (c?.email) lines.push(`Email: ${c.email}`);
  if (c?.linkedin) lines.push(`LinkedIn: ${c.linkedin}`);
  if (c?.portfolio) lines.push(`Portfolio: ${c.portfolio}`);

  const summary = resumeJson.sections?.summary?.content;
  if (summary) lines.push(`\nSummary: ${summary}`);

  const exps = resumeJson.sections?.experience ?? [];
  if (exps.length > 0) {
    lines.push('\nTop experience highlights:');
    exps.slice(0, 3).forEach(e => {
      lines.push(`- ${e.title ?? ''} at ${e.company ?? ''} (${e.dates ?? ''})`);
      (e.bullets ?? []).slice(0, 2).forEach(b => lines.push(`  - ${b}`));
    });
  }

  const skills = resumeJson.sections?.skills?.categories ?? [];
  if (skills.length > 0) {
    const topSkills = skills.flatMap(c => c.items ?? []).slice(0, 12).join(', ');
    lines.push(`\nKey skills: ${topSkills}`);
  }

  const edu = resumeJson.sections?.education ?? [];
  if (edu.length > 0) {
    lines.push(`\nEducation: ${edu.map(e => `${e.degree ?? ''}, ${e.institution ?? ''} (${e.year ?? ''})`).join('; ')}`);
  }

  return lines.join('\n');
}
