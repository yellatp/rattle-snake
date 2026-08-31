# API Reference

Base URL: `http://localhost:8787` (configurable via `API_PORT`, web uses
`PUBLIC_API_URL`). All request bodies are JSON; every response is JSON except
SSE and file downloads. 404/400/409 responses carry `{ "error": "..." }`.

Line numbers are against the current source at the time of writing - the
`router.*` registration is what you navigate to.

## Router mounts

Defined in `apps/api/src/app.ts`. Middleware chain (order matters): `cors -> securityHeaders -> bodyLimit -> auth -> auditContext -> rateLimit`. `/health` bypasses auth and rate limiting (liveness probe). `REQUIRE_API_KEY` defaults ON when `NODE_ENV=production`; keys via `API_KEYS`/`API_KEYS_FILE`; rate limiting via `RATE_LIMIT_*`; client IP via socket unless `TRUST_PROXY=true`.

| Prefix | Router file | Factory |
|---|---|---|
| `/health` | `apps/api/src/routes/health.ts` | `createHealthRouter(config, llm, store)` |
| `/api/jobs` | `apps/api/src/routes/jobs.ts` | `createJobsRouter(store, llm, config)` |
| `/api/exports` | `apps/api/src/routes/exports.ts` | `createExportsRouter(store, config)` |
| `/api/storage` | `apps/api/src/routes/storage.ts` | `createStorageRouter(store)` |
| /api/webhooks | `apps/api/src/routes/webhooks.ts | createWebhooksRouter(store, auditLogger) |
| `/api` | `apps/api/src/routes/settings.ts` | `createSettingsRouter(store, llm, config)` |

Request schemas are in `packages/shared/src/validation.ts` and validated with
`zValidator` (Hono + Zod).

---

## Health

| Method | Path | File:Line | Description |
|---|---|---|---|
| GET | `/health` | `health.ts` | `{ ok, service, db, llm: { provider, model } }`; **503** with `ok: false` when the SQLite probe fails. Exempt from API-key auth and rate limits so load balancers/orchestrators can probe it. |

---

## Jobs (`/api/jobs`) - `apps/api/src/routes/jobs.ts`

| Method | Path | File:Line | Description |
|---|---|---|---|
| POST | `/api/jobs` | `jobs.ts:51` | Create + start a committee evaluation. Returns **202** with the `JobState`. Body: `{ domain?, roleSlug?, profileId?, jobDescription (min 80), baseResume (min 50), sectorFocus?, location?, generate? (resume/coverLetter/coldEmail/interview flags + enhancementTier?), llm?, llmConnectionId? }`. `llm` (inline BYOK) and `llmConnectionId` are mutually exclusive (400 if both). `domain: "AUTO"` auto-detects. |
| GET | `/api/jobs` | `jobs.ts:110` | Compact, tenant-scoped list served from a lean SQL projection: `id, tenantId, domain, roleSlug, profileId, status, phase, finalVerdict, jdMeta, transcriptLength, hasResume, hasCoverLetter, hasInterview, createdAt, updatedAt` - heavy blobs are never parsed. |
| GET | `/api/jobs/:id` | `jobs.ts:121` | Full `JobState` (transcript, jdMeta, analyses, verdict, directorAudit, blueprint, executiveReview, resume). 404 if unknown. |
| PUT | `/api/jobs/:id/resume` | `jobs.ts:132` | Persist manual resume-JSON edits (`{ rewrittenResumeJson }`); re-renders Markdown server-side and rewrites the export dossier. |
| POST | `/api/jobs/:id/resume/generate` | `jobs.ts:156` | On-demand resume handoff. Body `{ roleSlug?, enhancementTier? ("conservative"|"balanced"|"competitive"), llm?, llmConnectionId? }`. Returns `{ markdown, json, meta }` (`meta.enhancements` carries the audit trail). 400 unless the job is `completed` with a blueprint. Emits `resume` SSE. |
| GET | `/api/jobs/:id/stream` | `jobs.ts:201` | **SSE** live debate stream (see SSE contract below). |
| POST | `/api/jobs/:id/cold-email` | `jobs.ts:256` | Cold-email intro. Body `{ audience? ("recruiter"|"founder"|"hiring_manager"), targetName?, tone?, llm?, llmConnectionId? }` -> `{ subject, body }`. |
| POST | `/api/jobs/:id/cover-letter` | `jobs.ts:279` | Cover-letter draft -> `{ subject, salutation, body, closing }`. |
| POST | `/api/jobs/:id/interview-mock` | `jobs.ts:297` | 5-expert `InterviewPrepPlan` (pipeline, per-expert expectations/drills/red flags, topics, tips). |
| POST | `/api/jobs/:id/cancel` | `jobs.ts:313` | Cooperative cancel of a live run. 409 if the run is not active. |
| DELETE | `/api/jobs/:id` | `jobs.ts:329` | Delete the run **and** its on-disk export dossier (204; 404 if missing). |

### SSE contract (`GET /api/jobs/:id/stream`)

Event types (the `JobEvent` union in `packages/shared/src/types.ts`): `status`,
`phase`, `entry`, `jdMeta`, `jobDecomposition`, `analysis`, `director`,
`verdict`, `blueprint`, `executive`, `resume`, `coldEmail`, `coverLetter`,
`interview`, `done`, `error`. Plus `ping` every 15s. For a completed/inactive
run the stream replays the current snapshot then closes with `done`. Live
events are published through the in-process bus in
`apps/api/src/events/bus.ts`.

Per-seat `analysis` events now include `confidence` (High/Medium/Low) and
`inflatedClaims`; the `director` event carries the fairness audit
(`DirectorAudit`) with an optional `revoteFactor`; the `verdict` tallies are
confidence-weighted (High 1.0 / Med 0.7 / Low 0.4).

---

## Settings (`/api`) - `apps/api/src/routes/settings.ts`

### Profiles

| Method | Path | File:Line | Description |
|---|---|---|---|
| GET | `/api/profile` | `settings.ts:42` | Legacy single-profile view (`{ name, email }`) - maps to the master profile. |
| PUT | `/api/profile` | `settings.ts:43` | Upsert the master profile. |
| GET | `/api/profiles` | `settings.ts:49` | List all candidate profiles (with `isMaster`, `hasPin`). |
| POST | `/api/profiles` | `settings.ts:50` | Create a profile (`{ name, email?, pin? }`); the first one becomes master. |
| PUT | `/api/profiles/:id` | `settings.ts:54` | Update a profile (structured `ProfileUpdateInput` deep-merge). |
| PUT | `/api/profiles/:id/master` | `settings.ts:61` | Set as master. 403 if PIN-protected and PIN is missing/wrong. |
| PUT | `/api/profiles/:id/pin` | `settings.ts:91` | Set/change the profile PIN. |
| DELETE | `/api/profiles/:id` | `settings.ts:96` | Delete (refuses the last profile; deleting a master re-promotes the oldest). |
| POST | `/api/profile/import-resume` | `settings.ts:77` | LLM-convert pasted resume text into a structured profile (`{ resumeText }`; raw text never persisted). |

### Resume templates + saved resumes

| Method | Path | File:Line | Description |
|---|---|---|---|
| GET | `/api/resume/templates` | `settings.ts:110` | The 32-template catalog (`listTemplateInfo()`), grouped by category. |
| GET | `/api/resumes` | `settings.ts:115` | List saved resumes. |
| POST | `/api/resumes` | `settings.ts:116` | Create saved resume (`{ title, content }`). |
| PUT | `/api/resumes/:id` | `settings.ts:120` | Update saved resume. |
| DELETE | `/api/resumes/:id` | `settings.ts:127` | Delete saved resume. |

### Saved job descriptions

| Method | Path | File:Line | Description |
|---|---|---|---|
| GET | `/api/jds` | `settings.ts:134` | List saved JDs. |
| POST | `/api/jds` | `settings.ts:135` | Create saved JD (`{ title, content }`). |
| PUT | `/api/jds/:id` | `settings.ts:139` | Update saved JD. |
| DELETE | `/api/jds/:id` | `settings.ts:146` | Delete saved JD. |

### LLM connections

| Method | Path | File:Line | Description |
|---|---|---|---|
| GET | `/api/llm-connections` | `settings.ts:153` | List stored connections - keys are masked (`hasKey`, `keyPreview`), never returned. |
| POST | `/api/llm-connections` | `settings.ts:154` | Create a connection; the API key is encrypted at rest (AES-256-GCM). |
| PUT | `/api/llm-connections/:id` | `settings.ts:158` | Update; omit `apiKey` to keep the stored one. |
| DELETE | `/api/llm-connections/:id` | `settings.ts:165` | Delete a connection. |

---

## Exports (`/api/exports`) - `apps/api/src/routes/exports.ts`

Auto-saved result dossiers (written by `writeDossier` in
`apps/api/src/exports/dossier.ts`). Whitelisted files per job:
`discussion.md`, `discussion.json`, `resume.md`, `resume.json`.

> The web **UI** no longer has a separate Exports page - it was folded into
> Storage (`/exports` 302-redirects to `/storage`, whose per-run file chips
> generate downloads client-side). This API remains the server-side auto-save
> and admin download/delete surface.

| Method | Path | File:Line | Description |
|---|---|---|---|
| GET | `/api/exports` | `exports.ts:20` | List every saved dossier with file sizes, joined to the job summary (domain, role, status, verdict, updatedAt) when the job still exists. Sorted by `updatedAt` desc. |
| GET | `/api/exports/:jobId/:file` | `exports.ts:52` | Download one artifact as `attachment; filename="<jobId>-<file>"` (`application/json` or `text/markdown`). Job id must match `^[A-Za-z0-9_-]{1,64}$`; file must be whitelisted (blocks traversal). |
| DELETE | `/api/exports/:jobId` | `exports.ts:70` | Delete the dossier **files** only (the run row is kept; use `DELETE /api/jobs/:id` to remove both). |

---

## Storage (`/api/storage`) - `apps/api/src/routes/storage.ts`

| Method | Path | File:Line | Description |
|---|---|---|---|
| GET | `/api/storage` | `storage.ts:75` | Profile-centric browsing of stored runs. Response groups runs under each profile by `(company, role)` derived from `jdMeta`, plus an `unassigned` bucket for runs without a profile. Each run carries status, verdict, transcript length, `hasDiscussion`, `hasResume`, `hasCoverLetter`, `hasInterview`, timestamps. |

---

## Per-run LLM selection (BYOK precedence)

From `apps/api/src/llm/resolve.ts` (`resolveLlmClientForRequest`, :27). A job
call resolves its LLM in this order:

1. Explicit `llmConnectionId` (stored connection, key decrypted server-side).
2. Inline `llm` override (`{ provider, baseUrl, apiKey, model, temperature }`) -
   mutually exclusive with `llmConnectionId`.
3. The Settings default connection.
4. The env-configured server client (`LLM_PROVIDER`, default `mock`).

Provider presets (base URL, default model, key env var) are in
`apps/api/src/llm/presets.ts`. Supported: `openai`, `anthropic`, `google`,
`deepseek`, `kimi`, `grok`, `groq`, `qwen`, `openrouter`, `ollama`, `vllm`,
`lmstudio`, `localai`, `mock`, `custom`. Unknown provider names are treated as
generic OpenAI-compatible.

---

## Webhooks (`/api/webhooks`) - `apps/api/src/routes/webhooks.ts`

Tenant-scoped CRUD for outbound webhooks. Every published job event
(`status`, `done`, `error`, `resume`, `coverLetter`, `coldEmail`, `interview`)
is delivered to each active webhook subscribed to a matching event.

| Method | Path | Description |
|---|---|---|
| GET | `/api/webhooks` | List webhooks for the caller's tenant. |
| POST | `/api/webhooks` | `{ url, events: WebhookEvent[], secret?, isActive? }` -> 201. URLs must be public http(s); loopback / RFC1918 / link-local / cloud-metadata targets are rejected (SSRF guard, 400). |
| GET | `/api/webhooks/:id` | One webhook. 404 if unknown or not visible to the tenant. |
| PUT | `/api/webhooks/:id` | Partial update (`url`, `events`, `secret`, `isActive`). |
| DELETE | `/api/webhooks/:id` | 204 / 404. |

Delivery contract:

- POST to `url` with JSON body `{ event, timestamp, tenantId, data }` (`data` is
  the raw job event).
- `X-Webhook-Signature: sha256=<hmac>` - HMAC-SHA256 of the raw request body
  using the webhook's signing secret. Secrets are AES-256-GCM encrypted at rest
  and never returned by the API (responses carry `hasSecret: boolean`).
- 10s per-attempt timeout, 3 attempts with exponential backoff on failure.
- Non-2xx deliveries and transport errors are audit-logged
  (`webhook.dispatch_failed`); they never block the pipeline.

## Tenant scoping (all routers)

Every router resolves a tenant from the request context (`X-Tenant-ID` header
when API-key auth is disabled; the key's mapped tenant when enabled) and scopes
all reads/writes. Rows with `tenant_id IS NULL` are legacy/shared and visible to
every tenant for backward compatibility. `/api/exports` and `/api/storage` are
scoped like every other router: dossier downloads and storage listings only
resolve for jobs visible to the caller's tenant.

## Product limits

- Up to **7 candidate profiles per tenant**; further creates return
  `400 { "error": "Profile limit reached: up to 7 profiles are allowed. Delete one to create another." }`.
---

## Auth (`/api/auth`) - `apps/api/src/auth/routes.ts`

Session-based account auth (design plan R3). Enforcement is behind the
`REQUIRE_AUTH` flag (default off - the endpoints exist but nothing is gated
until enabled). Sessions are opaque tokens in the `rs_session` HttpOnly cookie
(30-day expiry); mutations from a browser session additionally require the
`X-CSRF-Token` header matching the `rs_csrf` cookie.

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | `{ email, password (min 8), name? }` -> 201, creates the account, a personal workspace (owner membership), and a session. 400 on duplicate email or invalid input. |
| POST | `/api/auth/login` | `{ email, password }` -> 200 + session cookies. 401 invalid credentials; 429 after 10 failed attempts per IP within 5 minutes. |
| POST | `/api/auth/logout` | Revokes the session and clears both cookies. |
| GET | `/api/auth/me` | `{ authenticated, userId?, orgId?, role? }`. |

When `REQUIRE_AUTH=true`, every non-probe route requires a session or API key;
anonymous requests get 401 `{ error: "Sign in required." }`. When auth is on,
legacy `tenant_id IS NULL` rows are assigned to the default workspace at boot.

## Resume A/B review - `apps/api/src/committee/resumeAb.ts`

Second-expert-pass flow over the completed committee run (design plan R2):

| Method | Path | Description |
|---|---|---|
| POST | `/api/jobs/:id/resume/ab-run` | Starts the review: v1 (reuses the generated resume) -> eval1 -> v2 -> eval2 -> comparison. 202 `{ jobId, abPhase }`; 409 while one is in flight; 400 unless the job is completed with a blueprint. |
| GET | `/api/jobs/:id/resume/versions` | `{ versions: [...], comparison, selectedVersion, abPhase }` - both versions with their markdown/template/evaluation, the deterministic comparison, and the cursor. |
| POST | `/api/jobs/:id/resume/select` | `{ version: 1 \| 2 }` -> 200 with the updated `JobState`: the picked version becomes the canonical resume and is written to the dossier. |

SSE events during a run: `resumeEval` (per version), `resumeVariant` (v2
produced), `resumeComparison` (final). The comparison is computed in code with
locked weights (jdCoverage 0.35, credibility 0.30, clarity 0.20,
atsReadiness 0.15) and a 3-point tie band - the LLM never picks the winner.

## JSON envelope (v1)

Every webhook delivery body is now a versioned envelope:

```json
{
  "spec": "rattle-snake.envelope.v1",
  "type": "job.completed",
  "version": 1,
  "emittedAt": "2026-08-31T00:00:00.000Z",
  "tenantId": "org_...",
  "jobId": "run-013",
  "payload": { "...raw job event..." : "" }
}
```

`payload` is the same job event documented above. The `X-Webhook-Signature`
HMAC is computed over the serialized envelope. Future integrations (importers,
ATS posters, the browser extension) exchange the same envelope.