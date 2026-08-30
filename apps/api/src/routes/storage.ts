import { Hono } from "hono";
import type { JobState, UserProfile } from "@rattlesnake/shared";
import type { JobRunSummary, JobStore } from "../db/store.js";

interface RunSummary {
  jobId: string;
  company: string;
  role: string;
  status: JobState["status"];
  verdict: "SHORTLISTED" | "REJECTED" | null;
  transcriptLength: number;
  hasDiscussion: boolean;
  hasResume: boolean;
  hasCoverLetter: boolean;
  hasInterview: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RunGroup {
  company: string;
  role: string;
  runs: RunSummary[];
}

function runSummary(run: JobRunSummary): RunSummary {
  return {
    jobId: run.id,
    company: run.jdMeta?.company ?? "Unknown company",
    role: run.jdMeta?.role ?? run.roleSlug ?? "Generalist",
    status: run.status,
    verdict: run.finalVerdict ?? null,
    transcriptLength: run.transcriptLength,
    hasDiscussion: run.transcriptLength > 0,
    hasResume: run.hasResume,
    hasCoverLetter: run.hasCoverLetter,
    hasInterview: run.hasInterview,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function groupRuns(runs: JobRunSummary[]): RunGroup[] {
  const byKey = new Map<string, RunGroup>();
  for (const run of runs) {
    const company = run.jdMeta?.company ?? "Unknown company";
    const role = run.jdMeta?.role ?? run.roleSlug ?? "Generalist";
    const key = `${company}\u0000${role}`;
    let group = byKey.get(key);
    if (!group) {
      group = { company, role, runs: [] };
      byKey.set(key, group);
    }
    group.runs.push(runSummary(run));
  }
  return [...byKey.values()].map((g) => ({
    ...g,
    runs: g.runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }));
}

function sortGroups(groups: RunGroup[]): RunGroup[] {
  return groups.sort((a, b) => {
    const aRecent = a.runs[0]?.updatedAt ?? "";
    const bRecent = b.runs[0]?.updatedAt ?? "";
    return bRecent.localeCompare(aRecent) || a.company.localeCompare(b.company);
  });
}

/**
 * Profile-centric storage: every generated discussion and resume, grouped by
 * candidate profile and then by company + role, so the user can browse all
 * previous results for a given profile in one place.
 */
export function createStorageRouter(store: JobStore) {
  const router = new Hono();

  const tenantId = (c: { get: (key: "tenantId") => string }) => c.get("tenantId") ?? "default";

  // GET /api/storage — profiles -> (company, role) -> runs. Tenant-scoped and
  // served from the lean projection (no artifact blobs deserialized).
  router.get("/", (c) => {
    const tenant = tenantId(c);
    const profiles = store.listProfiles(tenant);
    const runs = store.listRunSummaries(tenant);

    const profileById = new Map(profiles.map((p) => [p.id, p] as const));
    const byProfile = new Map<string, JobRunSummary[]>();
    const unassigned: JobRunSummary[] = [];

    for (const run of runs) {
      if (run.profileId && profileById.has(run.profileId)) {
        const bucket = byProfile.get(run.profileId) ?? [];
        bucket.push(run);
        byProfile.set(run.profileId, bucket);
      } else {
        unassigned.push(run);
      }
    }

    const profilesOut = profiles
      .map((profile: UserProfile) => ({
        profile: { id: profile.id, name: profile.name, isMaster: profile.isMaster },
        groups: sortGroups(groupRuns(byProfile.get(profile.id) ?? [])),
      }))
      .filter((entry) => entry.groups.length > 0);

    return c.json({
      profiles: profilesOut,
      unassigned: sortGroups(groupRuns(unassigned)),
    });
  });

  return router;
}
