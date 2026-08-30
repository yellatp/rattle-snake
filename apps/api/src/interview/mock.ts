import {
  interviewPrepPlanSchema,
  type InterviewExpertDrill,
  type InterviewPhase,
  type InterviewPrepPlan,
  type JobState,
  type UserProfile,
} from "@rattlesnake/shared";
import { getCommitteeForDomain } from "@rattlesnake/shared";
import type { LLMClient } from "../llm/types.js";
import { getRolePrompt, getTemplate, resolveRoleSlug } from "../resume/roleRegistry.js";
import { getScreeningChecklist } from "../resume/screening.js";
import { buildProfileBio } from "../resume/profile.js";
import { sanitizeText, buildTypographyDirective } from "../resume/sanitize.js";
import { estimateExperienceYears } from "../resume/experience.js";

/**
 * Interview mock plan generator.
 *
 * Applies the committee-debate strategy to interview prep: the same committee
 * the debate uses (Senior / Manager / Staff / Principal / Recruiter / Sector,
 * filtered to the candidate's experience band) is asked to lay out the typical
 * interview pipeline for the role, what each expert expects from the candidate,
 * how they will drill the candidate from the JD, and how the interview flow
 * plays out.
 *
 * Strategy: LLM synthesis first, deterministic rules-based fallback if the
 * model output is missing or malformed. All strings are typography-sanitized.
 */

function yearsFor(job: JobState, profile?: UserProfile): number | undefined {
  return estimateExperienceYears(profile, job.baseResume);
}

export function buildInterviewMockPrompt(job: JobState, profile?: UserProfile): string {
  const roleSlug =
    (job.roleSlug && getTemplate(job.roleSlug) ? job.roleSlug : undefined) ??
    resolveRoleSlug(job.domain, job.jobDescription);
  const roleLabel = getTemplate(roleSlug)?.role ?? roleSlug;
  const rolePrompt = getRolePrompt(roleSlug);
  const agents = getCommitteeForDomain(job.domain, job.sectorFocus, job.roleSlug, yearsFor(job, profile));
  const checklist = getScreeningChecklist(roleSlug);

  const blocks: string[] = [
    `You are an interview coach for job applications. You help a candidate prepare using the same ${agents.length}-expert hiring committee used to evaluate the application: each committee seat describes (a) what they expect the candidate to know, (b) how they will drill the candidate based on the JD, and (c) the red flags they probe for. You also lay out the typical interview phases for the role and how a typical interview will go.`,
    `## TARGET ROLE\n${roleLabel}`,
    `## HIRING COMMITTEE (${agents.length} seats)\n${agents
      .map((a) => `- ${a.name}, ${a.role}: ${a.focus}`)
      .join("\n")}`,
    `## SCREENING BAR (what the committee flags as required)\n${checklist.length > 0 ? `- ${checklist.join("\n- ")}` : "Not specified."}`,
  ];

  if (rolePrompt) blocks.push(`## ROLE CONTEXT\n${rolePrompt.slice(0, 3000)}`);

  if (profile) {
    blocks.push(`## CANDIDATE PROFILE\n${buildProfileBio(profile)}`);
  } else {
    blocks.push(`## CANDIDATE RESUME\n${job.baseResume.slice(0, 2500)}`);
  }

  blocks.push(
    `## OUTPUT FORMAT (strict JSON, no markdown fences, no prose)`,
    `{
  "roleLabel": string,
  "summary": string,
  "pipeline": [ { "name": string, "duration": string, "format": string, "focus": string, "typicalQuestions": string[] } ],
  "experts": [ { "seat": string, "role": string, "lens": string, "expectations": string[], "drillQuestions": string[], "redFlags": string[] } ],
  "topics": string[],
  "prepTips": string[]
}`,
    `Produce exactly ${agents.length} experts (one per committee seat), 4-6 pipeline phases, 8-12 topics, and 4-6 prep tips.`,
    buildTypographyDirective(),
  );

  return blocks.join("\n\n");
}

export async function generateInterviewMock(
  job: JobState,
  llm: LLMClient,
  profile?: UserProfile,
): Promise<InterviewPrepPlan> {
  const llmResult = await extractViaLLM(job, llm, profile).catch((err) => {
    console.warn(`[pipeline] interview-mock LLM generation failed for job ${job.id}; using rules-based fallback:`, err);
    return null;
  });
  if (llmResult) return llmResult;
  return buildRulesBased(job, profile);
}

async function extractViaLLM(
  job: JobState,
  llm: LLMClient,
  profile?: UserProfile,
): Promise<InterviewPrepPlan | null> {
  const raw = await llm.complete(
    buildInterviewMockPrompt(job, profile),
    "Produce the interview mock plan JSON only.",
    { temperature: 0.6, maxTokens: 2400 },
  );
  const json = stripCodeFences(raw);
  const parsed = JSON.parse(json) as unknown;
  const validated = interviewPrepPlanSchema.safeParse(parsed);
  if (!validated.success) return null;
  return sanitizePlan(validated.data);
}

function sanitizePlan(plan: InterviewPrepPlan): InterviewPrepPlan {
  const clean = (s: string) => sanitizeText(s);
  const cleanList = (xs: string[]) => xs.map(clean);
  return {
    roleLabel: clean(plan.roleLabel),
    summary: clean(plan.summary),
    pipeline: plan.pipeline.map((p) => ({
      name: clean(p.name),
      duration: clean(p.duration),
      format: clean(p.format),
      focus: clean(p.focus),
      typicalQuestions: cleanList(p.typicalQuestions),
    })),
    experts: plan.experts.map((e) => ({
      seat: clean(e.seat),
      role: clean(e.role),
      lens: clean(e.lens),
      expectations: cleanList(e.expectations),
      drillQuestions: cleanList(e.drillQuestions),
      redFlags: cleanList(e.redFlags),
    })),
    topics: cleanList(plan.topics),
    prepTips: cleanList(plan.prepTips),
  };
}

/** Deterministic fallback: a credible plan assembled from the role registry. */
export function buildRulesBased(job: JobState, profile?: UserProfile): InterviewPrepPlan {
  const roleSlug =
    (job.roleSlug && getTemplate(job.roleSlug) ? job.roleSlug : undefined) ??
    resolveRoleSlug(job.domain, job.jobDescription);
  const template = getTemplate(roleSlug);
  const roleLabel = template?.role ?? roleSlug;
  const keywords = (template?.ats_keywords ?? []).slice(0, 12);
  const checklist = getScreeningChecklist(roleSlug);
  const agents = getCommitteeForDomain(job.domain, job.sectorFocus, job.roleSlug, yearsFor(job, profile));

  const topics = [...new Set([...keywords, ...splitFocus(agents)])].slice(0, 12);

  const pipeline: InterviewPhase[] = [
    {
      name: "Recruiter Screen",
      duration: "30-45 min",
      format: "Phone or video",
      focus: "Baseline fit: title alignment, years of experience, work authorization, and comp band.",
      typicalQuestions: [
        `Why are you interested in this ${roleLabel} role?`,
        "Walk me through your most relevant experience for this position.",
        "What is your expected compensation range and notice period?",
        "Are you comfortable with the location and work setup for this role?",
      ],
    },
    {
      name: "Technical Screen",
      duration: "45-60 min",
      format: "Video with live exercise",
      focus: "Core hard skills from the JD under time pressure.",
      typicalQuestions: [
        `Walk me through a recent ${keywords[0] ?? "core"} problem you solved and your approach.`,
        `How would you explain ${keywords[1] ?? "your core skill"} to a non-expert?`,
        "Work through this short exercise out loud, explaining your tradeoffs.",
        "What is the hardest bug or blocker you have resolved recently?",
      ],
    },
    {
      name: "Technical Loop / Panel",
      duration: "2-4 hours",
      format: "Video panel or on-site",
      focus: "Depth on the JD's core areas, collaboration, and system thinking.",
      typicalQuestions: [
        `Design or analyze a system using ${keywords.slice(0, 3).join(", ")}. Where do you start and what do you cut?`,
        "Describe a conflict with a colleague and how you resolved it.",
        `How do you stay current on ${roleLabel} best practices?`,
        "What would you change about a system you recently shipped?",
      ],
    },
    {
      name: "Hiring Manager",
      duration: "30-45 min",
      format: "Video",
      focus: "Scope ownership, impact, growth, and expectations for the role.",
      typicalQuestions: [
        "What are you looking for in the next step of your career?",
        "Tell me about a goal you set and how you measured success.",
        "How would you handle ambiguity in the first 90 days?",
        "What do you need from a manager to do your best work?",
      ],
    },
    {
      name: "Final Round / Leadership",
      duration: "30-60 min",
      format: "Video",
      focus: "Strategy, judgment, and closing the loop on expectations.",
      typicalQuestions: [
        "Where do you see this team or product going, and what would your first contribution be?",
        "Tell me about a decision you made that did not work out and what you learned.",
        "Why should we hire you over other strong candidates?",
        "Do you have any remaining questions about the team, role, or compensation?",
      ],
    },
  ];

  const experts: InterviewExpertDrill[] = agents.map((agent) => {
    const seat = agent.tone ?? "manager";
    const expectations = expectationsFor(seat, agent.focus, checklist, keywords, roleLabel);
    return {
      seat: agent.name,
      role: agent.role,
      lens: agent.focus,
      expectations,
      drillQuestions: drillFor(seat, keywords, expectations),
      redFlags: redFlagsFor(seat, keywords),
    };
  });

  const summary = `The interview process for the ${roleLabel} role typically runs five phases: a recruiter screen, a technical screen, a technical loop, a hiring manager round, and a final round. Expect each of the ${agents.length} committee seats to probe the topics below against your resume and the JD.`;

  const prepTips = [
    `Map each item in the screening bar below to a concrete story from your resume; every claim should have an example.`,
    `Prepare a two-minute narrative for "tell me about yourself" that connects your background to the ${roleLabel} role specifically.`,
    `Practice the drill questions for your weakest expert seat until the answer is crisp.`,
    `Prepare questions to ask: one about the team, one about the role's first 90 days, and one about how success is measured.`,
    `Re-read the JD the morning of the interview and re-quote its specific requirements in your answers.`,
  ];

  return {
    roleLabel,
    summary,
    pipeline,
    experts,
    topics,
    prepTips,
  };
}

function expectationsFor(
  seat: string,
  focus: string,
  checklist: string[],
  keywords: string[],
  roleLabel: string,
): string[] {
  const focusItems = splitFocusItems(focus).slice(0, 4);
  switch (seat) {
    case "recruiter":
      return [
        `Clear alignment of your title and years of experience with the ${roleLabel} posting.`,
        "A crisp, well-rehearsed career narrative and reason for applying.",
        "Transparent answers on compensation band, notice period, and work setup.",
        "No unexplained gaps or contradictions between the resume and your answers.",
      ];
    case "architect":
      return checklist.length > 0 ? checklist.slice(0, 6) : focusItems;
    case "lead":
      return [
        ...focusItems,
        "Concrete examples of shipping work as part of a team and unblocking others.",
        "A system-level view: you can describe design tradeoffs, not just usage.",
      ];
    case "manager":
      return [
        ...focusItems.slice(0, 2),
        "Evidence of impact you can quantify, tied to business outcomes.",
        "A clear sense of scope you have owned end to end.",
        "Honest self-assessment of growth areas and how you address them.",
      ];
    default:
      return [
        ...focusItems,
        `Understanding of how the role fits the sector's operating context and constraints.`,
        "Ability to translate between sector-specific concerns and your core skills.",
      ];
  }
}

function drillFor(seat: string, keywords: string[], expectations: string[]): string[] {
  const k = keywords.length > 0 ? keywords : ["your core skill"];
  switch (seat) {
    case "recruiter":
      return [
        "Tell me about yourself and why this role, in under two minutes.",
        "Why do you want this specific company and team?",
        "What is your current compensation and what are you targeting?",
      ];
    case "architect":
      return [
        `Pick the strongest achievement on your resume and walk me through the design end to end.`,
        `Walk me through a time you used ${k[0]}. What tradeoffs did you weigh?`,
        `How would you design a solution for this JD's core problem from scratch? What would you cut first?`,
        `Describe a production incident you debugged: root cause, fix, and how you prevented recurrence.`,
      ];
    case "lead":
      return [
        "Describe a project you delivered with a team and your specific contribution.",
        "Tell me about a time you disagreed with a technical decision. What did you do?",
        "How do you handle ambiguity when requirements keep changing?",
      ];
    case "manager":
      return [
        "Walk me through a goal you owned and how you measured success.",
        "Tell me about a failure and what you changed afterward.",
        "How would you spend your first 90 days in this role?",
      ];
    default:
      return [
        `How does the sector's context (${k.slice(0, 2).join(", ")}) change how you approach the work?`,
        "Give an example of adapting a general skill to a sector-specific constraint.",
      ];
  }
}

function redFlagsFor(seat: string, keywords: string[]): string[] {
  const k = keywords[0] ?? "the core requirement";
  switch (seat) {
    case "recruiter":
      return [
        "Resume mismatch with the JD title, years, or required skills.",
        "Unclear or contradictory answers on compensation and notice period.",
        "No researched reasons for applying to this company.",
      ];
    case "architect":
      return [
        `Claiming ${k} without a concrete, detailed production example.`,
        "Naming tools without being able to discuss tradeoffs.",
        "Defensiveness when asked to explore a better approach.",
        "Vague on systems, strong only on syntax or memorized answers.",
      ];
    case "lead":
      return [
        "No example of shipping with a team or resolving conflict.",
        "Blaming others for missed deadlines or failures.",
      ];
    case "manager":
      return [
        "Impact claims with no numbers or business linkage.",
        "No ownership of failures or growth areas.",
      ];
    default:
      return [
        "No awareness of the sector's operating constraints or compliance context.",
        "Treating sector-specific knowledge as irrelevant to the role.",
      ];
  }
}

function splitFocus(agents: ReturnType<typeof getCommitteeForDomain>): string[] {
  const words = new Set<string>();
  for (const agent of agents) {
    for (const item of splitFocusItems(agent.focus)) {
      for (const word of item.split(/\s+/)) {
        if (word.length > 5 && !STOPWORDS.has(word)) words.add(word.toLowerCase());
      }
    }
  }
  return [...words].slice(0, 10);
}

function splitFocusItems(focus: string): string[] {
  return focus
    .split(/[,.;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3 && !/^[a-z]+[A-Z]/.test(s))
    .slice(0, 6);
}

const STOPWORDS = new Set([
  "about",
  "across",
  "between",
  "domain",
  "expert",
  "expertise",
  "including",
  "knowledge",
  "practices",
  "systems",
  "through",
  "without",
  "their",
  "there",
  "these",
  "those",
  "which",
  "would",
  "within",
]);

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
}
