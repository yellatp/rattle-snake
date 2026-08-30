export interface ScenarioQuestion {
  id: string;
  prompt: string;
  hint: string;
}

const SDE: ScenarioQuestion[] = [
  {
    id: "sde-1",
    prompt:
      "Your API's p99 latency doubled after last night's deploy, but only for requests with large payloads. Dashboards show nothing unusual. How do you triage this?",
    hint: "compare request paths, check slow-query and serialization cost changes, bisect the deploy",
  },
  {
    id: "sde-2",
    prompt:
      "A heavily used search endpoint returns stale data in production. Cache TTLs are correct and the database holds fresh rows. Where do you look next and how do you verify the fix?",
    hint: "check invalidation events, replicas and read path, then reproduce with a canary",
  },
  {
    id: "sde-3",
    prompt:
      "A background job that fans out 10,000 tasks fails intermittently at the same step, but only under load. Retries mask the issue. How do you find the real cause?",
    hint: "look for dependency throttling, resource contention, and non-idempotent retry side effects",
  },
  {
    id: "sde-4",
    prompt:
      "A long-held feature branch merged and broke production on a Friday afternoon. Two teams share the codebase with different release cadences. Walk through your rollback and recovery plan.",
    hint: "feature flags, hotfix vs revert, coordination and communication windows",
  },
  {
    id: "sde-5",
    prompt:
      "Your database connection pool is exhausted during a traffic spike, and increasing the pool size made it worse. What is the real bottleneck and how do you prove it?",
    hint: "leaked connections, slow queries holding sessions, checkpoint saturation",
  },
];

const DATA_ENGINEERING: ScenarioQuestion[] = [
  {
    id: "de-1",
    prompt:
      "Your nightly 50M-row load takes six hours and keeps failing near the end. Business needs the data by 6am. How do you make it resilient and faster?",
    hint: "incremental loads, checkpointing and retry semantics, partitioning",
  },
  {
    id: "de-2",
    prompt:
      "A Kafka consumer group is lagging badly after a schema change. Some messages fail to deserialize and stall the group. How do you handle the poison messages without losing data?",
    hint: "dead-letter queue, pause vs skip strategy, schema evolution rollout",
  },
  {
    id: "de-3",
    prompt:
      "A retry ran twice and your fact table now has duplicate keys, so revenue dashboards are double-counting. How do you deduplicate and prevent recurrence?",
    hint: "idempotent writes, uniqueness constraints, and retry policy redesign",
  },
  {
    id: "de-4",
    prompt:
      "An analyst says a transformation is wrong only for a specific date range. The pipeline is idempotent and all tests pass. How do you reproduce and isolate the issue?",
    hint: "replay that window, check upstream data changes and timezone boundaries",
  },
  {
    id: "de-5",
    prompt:
      "A real-time feature depends on data that arrives minutes late under load. Dashboards start disagreeing with batch reports. How do you keep both consistent?",
    hint: "watermarking, late-data handling, and reconciliation jobs",
  },
];

const ML_ENGINEERING: ScenarioQuestion[] = [
  {
    id: "mle-1",
    prompt:
      "A model you deployed yesterday is degrading in production today. Offline evaluation looked great. What changed and how do you investigate drift before ground truth labels arrive?",
    hint: "feature drift, data skew, serving vs training code paths",
  },
  {
    id: "mle-2",
    prompt:
      "Your offline features use a 1-day lag while online serving uses real-time features. The A/B test shows the online variant performing worse. How do you debug online/offline skew?",
    hint: "compare feature distributions, log served features, trace through the feature store",
  },
  {
    id: "mle-3",
    prompt:
      "Inference latency must drop from 300ms to 50ms for a new SLA on a transformer model. What trade-offs do you evaluate before touching the model?",
    hint: "batching, quantization, caching, and serving topology",
  },
  {
    id: "mle-4",
    prompt:
      "An alert shows prediction volume dropped 80% overnight. Serving infrastructure reports healthy. What is your triage plan?",
    hint: "traffic routing, feature pipeline health, and schema/version mismatches",
  },
  {
    id: "mle-5",
    prompt:
      "Your retraining pipeline silently regressed on a slice of users that spend more. Global metrics look fine. How do you catch and fix it?",
    hint: "segmented evaluation, data leakage between versions, monitoring per cohort",
  },
];

const DATA_SCIENCE: ScenarioQuestion[] = [
  {
    id: "ds-1",
    prompt:
      "Marketing wants a churn model, but the positive class is 0.5% and labeled data is scarce. How do you design the modeling approach and evaluation strategy?",
    hint: "resampling, calibrated probability thresholds, precision/recall trade-off",
  },
  {
    id: "ds-2",
    prompt:
      "The business says your pricing model's uplift estimates were too optimistic after rollout, even though holdout validation looked sound. How do you audit it?",
    hint: "expectation vs realized values, selection bias in training data, regime change",
  },
  {
    id: "ds-3",
    prompt:
      "You must forecast demand for a new product line with three months of history during a major demand shift. What do you do?",
    hint: "borrow priors from similar products, blend time-series with judgmental overlays",
  },
  {
    id: "ds-4",
    prompt:
      "An experiment shows a significant lift, but only when the metric is measured one specific way. Stakeholders want to ship it. How do you respond?",
    hint: "guardrail metrics, multiple testing, and preregistered analysis",
  },
  {
    id: "ds-5",
    prompt:
      "A model that worked well last quarter now performs differently across the same segments. Nothing in the code changed. Where do you start?",
    hint: "population shift, label drift, and external macro changes",
  },
];

const AI_ENGINEERING: ScenarioQuestion[] = [
  {
    id: "aie-1",
    prompt:
      "Your RAG app returns confident-sounding answers from the wrong documents under heavy load. Latency is fine. How do you debug retrieval quality in production?",
    hint: "log retrieved chunks, compare chunking strategies, check embedding/query drift",
  },
  {
    id: "aie-2",
    prompt:
      "An LLM feature costs $0.05 per request and traffic just tripled. You must cut cost without visibly dropping quality. What do you measure and try?",
    hint: "prompt/context trimming, caching, model-tier routing by intent",
  },
  {
    id: "aie-3",
    prompt:
      "Your agent sometimes calls the wrong tool and sometimes loops. You cannot reproduce it locally. How do you build observability to find and fix the failure modes?",
    hint: "trace tool calls and reasoning, replay from logs, add retry limits",
  },
  {
    id: "aie-4",
    prompt:
      "A prompt change passed every eval case, yet broke a rare but critical customer-facing answer in production. How do you ship prompt changes safely?",
    hint: "regression eval sets, canary prompts, and staged rollout",
  },
  {
    id: "aie-5",
    prompt:
      "Your chatbot starts leaking internal context into customer-facing answers after a prompt update. It shows in only some traffic. How do you contain it?",
    hint: "kill switch, input/output guardrails, and trace the leak source",
  },
];

const CYBERSECURITY: ScenarioQuestion[] = [
  {
    id: "sec-1",
    prompt:
      "An alert shows a service account calling APIs from a new region it has never used, and it holds privileged IAM. Walk through your response.",
    hint: "verify identity, scope blast radius, revoke vs observe, hunt for lateral movement",
  },
  {
    id: "sec-2",
    prompt:
      "A library your app depends on has a critical CVE disclosed at 3am with no patched release yet. What do you do immediately and in the next 24 hours?",
    hint: "assess real exposure, mitigation controls, temporary workarounds, comms",
  },
  {
    id: "sec-3",
    prompt:
      "You discover 100,000 leaked customer records in a public storage bucket, and you are the first to notice. What is your incident response sequence?",
    hint: "secure the bucket, preserve evidence, notify the right people in the right order",
  },
  {
    id: "sec-4",
    prompt:
      "A phishing-resistant MFA rollout is being blocked because executives find it slow. How do you balance security with adoption?",
    hint: "phased rollout, exception process, usability improvements, risk-based controls",
  },
  {
    id: "sec-5",
    prompt:
      "An internal tool started downloading large amounts of data during off-hours. The owner says it is a legit script that ran early. How do you validate that?",
    hint: "baseline behavior, source of the script, and privilege justification",
  },
];

const NETWORKING: ScenarioQuestion[] = [
  {
    id: "net-1",
    prompt:
      "Users in one region report timeouts to your API, but the provider's status page is green and other regions work fine. Walk through your troubleshooting.",
    hint: "route maps, DNS TTL, anycast vs regional endpoints, local ISP issues",
  },
  {
    id: "net-2",
    prompt:
      "A stateful firewall is dropping legitimate traffic after a new load balancer was introduced. How do you isolate whether it is routing, DNS, or the firewall?",
    hint: "trace flows at each hop, compare packet captures, check session tracking",
  },
  {
    id: "net-3",
    prompt:
      "A service mesh is adding 20ms per call and the team wants it gone. What measurements do you take before ripping it out?",
    hint: "baseline latency, mTLS overhead, retries, and observability that depends on it",
  },
  {
    id: "net-4",
    prompt:
      "A misconfigured client is sending malformed packets that saturate a switch's CPU. Other traffic degrades. How do you contain and fix it?",
    hint: "rate limiting, port isolation, and protocol-level validation",
  },
  {
    id: "net-5",
    prompt:
      "Your VPN gateway reboots during peak hours every day. Users are disconnected but reconnect quickly. How do you diagnose it?",
    hint: "resource exhaustion, licensing/connection limits, and scheduled maintenance overlap",
  },
];

const DEVOPS: ScenarioQuestion[] = [
  {
    id: "devops-1",
    prompt:
      "A deployment tool that ran fine for months now fails with an unrelated-looking timeout at the same stage. Infrastructure reports everything healthy. How do you debug it?",
    hint: "compare last known-good config, check external dependencies, look at retries",
  },
  {
    id: "devops-2",
    prompt:
      "CI is green, but a release breaks production only when a specific cluster configuration is present. How do you reproduce and fix it?",
    hint: "diff config vs CI, test against a staging clone, add config-aware tests",
  },
  {
    id: "devops-3",
    prompt:
      "Cloud costs jumped 40% after a new service went live. You must find the waste by end of day. What is your approach?",
    hint: "cost by resource and label, spot idle capacity, correlate with deploy time",
  },
  {
    id: "devops-4",
    prompt:
      "An incident is underway and the on-call engineer goes silent mid-remediation. Walk through the escalation and communication plan.",
    hint: "redundant on-call, incident roles, status comms, handoff documentation",
  },
  {
    id: "devops-5",
    prompt:
      "A config change takes 30 minutes to propagate because many services poll it. You need it applied immediately during an outage. What do you do, then fix long-term?",
    hint: "push-based invalidation, feature flags, and fallback values",
  },
];

const PROJECT_MANAGEMENT: ScenarioQuestion[] = [
  {
    id: "pm-1",
    prompt:
      "Your roadmap promises a feature in six weeks, but a critical dependency you assumed was ready will not be. The team is already at capacity. What do you do?",
    hint: "renegotiate scope and timeline, surface risk early, swap dependency approach",
  },
  {
    id: "pm-2",
    prompt:
      "A senior engineer estimates four weeks; a junior says one. A stakeholder wants a commitment tomorrow. How do you reach a defensible number?",
    hint: "break the work down, ask what each estimate assumes, plan for uncertainty",
  },
  {
    id: "pm-3",
    prompt:
      "Two teams you depend on each report being on track, yet integration keeps slipping. How do you find the real status?",
    hint: "check integration artifacts, not status updates; look for handoff gaps",
  },
  {
    id: "pm-4",
    prompt:
      "A production incident forces the team to drop planned work mid-sprint. How do you reprioritize without burning the team out?",
    hint: "cut non-critical scope, protect focus time, and manage stakeholder expectations",
  },
  {
    id: "pm-5",
    prompt:
      "A key engineer is leaving and owns the only deep knowledge of a critical service. How do you de-risk the transition?",
    hint: "knowledge transfer plan, documentation audit, and shadowing schedule",
  },
];

const GENERAL: ScenarioQuestion[] = [
  {
    id: "gen-1",
    prompt:
      "A new deploy, a feature flag, and a sudden error spike for 5% of users. What is your sequence of checks?",
    hint: "correlate flag with error cohort, roll back the flag first, then the deploy",
  },
  {
    id: "gen-2",
    prompt:
      "A teammate is about to ship a change you believe has a subtle design flaw, but they are confident it is fine. How do you handle it?",
    hint: "cite concrete failure modes, propose a small experiment or review",
  },
  {
    id: "gen-3",
    prompt:
      "You inherit a system nobody fully understands, and it breaks every Tuesday. How do you approach it?",
    hint: "find the Tuesday correlation, map dependencies, build a runbook",
  },
  {
    id: "gen-4",
    prompt:
      "Your manager asks for a status update, but you have more unknowns than answers. How do you respond honestly and constructively?",
    hint: "state what is known, what is blocking, and the plan to find out",
  },
  {
    id: "gen-5",
    prompt:
      "You find a bug in a critical path that your team's deadline depends on. Fixing it properly takes a week; a workaround takes a day. What do you decide?",
    hint: "assess risk and data integrity, buy time with the workaround, schedule the real fix",
  },
];

const DOMAIN_SETS: Record<string, ScenarioQuestion[]> = {
  SDE,
  DATA_ENGINEERING,
  DATA_SCIENCE,
  ML_ENGINEERING,
  AI_ENGINEERING,
  CYBERSECURITY,
  NETWORKING,
  DEVOPS,
  PROJECT_MANAGEMENT,
  GENERAL,
};

function normalizeKey(key: string): string {
  const k = key.trim().toUpperCase();
  if (k.includes("DEVOPS") || k.includes("SRE") || k.includes("PLATFORM")) return "DEVOPS";
  if (k.includes("DATA") && k.includes("ENGINEER")) return "DATA_ENGINEERING";
  if (k.includes("DATA") && k.includes("SCIENCE")) return "DATA_SCIENCE";
  if (k.includes("ML") || k.includes("MACHINE LEARNING")) return "ML_ENGINEERING";
  if (k.includes("AI") && k.includes("ENGINEER")) return "AI_ENGINEERING";
  if (k.includes("SECUR")) return "CYBERSECURITY";
  if (k.includes("NETWORK")) return "NETWORKING";
  if (k.includes("PROJECT") || k.includes("PROGRAM") || k.includes("PRODUCT")) return "PROJECT_MANAGEMENT";
  return "GENERAL";
}

export function scenarioQuestionsFor(domain: string, roleSlug?: string): ScenarioQuestion[] {
  if (roleSlug && roleSlug.trim()) {
    const key = normalizeKey(roleSlug);
    if (key !== "GENERAL") return DOMAIN_SETS[key];
  }
  return DOMAIN_SETS[normalizeKey(domain)] ?? DOMAIN_SETS.GENERAL;
}
