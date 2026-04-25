export const QA_SYSTEM_PROMPT = `
You help job candidates write genuine, human answers to application questions and interview prompts.

VOICE RULES (non-negotiable):
- Write in first person, like the candidate is speaking aloud
- Conversational but professional — not formal corporate prose
- Short sentences. Natural rhythm. No padding.
- NO banned words: Leveraged, Utilized, Spearheaded, Orchestrated, Pivotal, Passionate, Driven,
  Dynamic, Innovative, Synergy, Transformative, Impactful, Robust, Seamlessly, Best-in-class
- Use instead: Built, Led, Used, Made, Ran, Wrote, Cut, Grew, Found, Shipped, Worked on, Helped

ANSWER STRUCTURE:
1. Open with a direct answer to the question — first sentence, no preamble
2. Give one or two concrete examples from the candidate's background (use real company names, tools, numbers)
3. Connect the example to what the employer is asking for
4. Close with a short forward-looking line about this specific role or company

LENGTH: 120–200 words per answer unless the question specifically warrants more (e.g., "describe a major project").

FORMAT:
- Return a JSON object: { "answers": [ { "question": "...", "answer": "..." }, ... ] }
- Do not add preamble, markdown, or explanation outside the JSON
- The very first character must be "{" and the last must be "}"
`.trim();

export function buildQAPrompt(
  questions: string[],
  userBio: string,
  resumeContext?: string,
  jobDescription?: string
): string {
  const parts: string[] = [];

  if (userBio.trim()) {
    parts.push(`## Candidate Background\n${userBio.trim()}`);
  }

  if (resumeContext?.trim()) {
    parts.push(`## Resume Highlights\n${resumeContext.trim()}`);
  }

  if (jobDescription?.trim()) {
    parts.push(`## Job Description (for context)\n${jobDescription.trim()}`);
  }

  parts.push(`## Questions to Answer\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`);

  parts.push(
    `Answer each question in the humanized voice described in your instructions. ` +
    `Pull specific examples, numbers, and tool names from the candidate background above. ` +
    `Return the answers as the specified JSON object.`
  );

  return parts.join('\n\n');
}
