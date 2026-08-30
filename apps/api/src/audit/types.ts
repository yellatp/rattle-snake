/**
 * Audit event types for the SaaS layer.
 *
 * Every security-relevant action should emit an AuditEvent so operators can
 * trace who/which tenant triggered what, when, and with which outcome.
 */

export type AuditAction =
  | "job.created"
  | "job.cancelled"
  | "job.deleted"
  | "job.resumed"
  | "resume.generated"
  | "cover_letter.generated"
  | "cold_email.generated"
  | "interview.generated"
  | "llm_connection.created"
  | "llm_connection.deleted"
  | "llm_connection.used"
  | "profile.created"
  | "profile.updated"
  | "profile.deleted"
  | "profile.master_set"
  | "profile.pin_set"
  | "profile.imported"
  | "saved_resume.created"
  | "saved_resume.updated"
  | "saved_resume.deleted"
  | "saved_jd.created"
  | "saved_jd.updated"
  | "saved_jd.deleted"
  | "llm_connection.updated"
  | "webhook.created"
  | "webhook.updated"
  | "webhook.deleted"
  | "webhook.dispatch_failed"
  | "api_key.used"
  | "api_key.rejected"
  | "rate_limit.hit";

export interface AuditEvent {
  /** ISO timestamp. */
  timestamp: string;
  /** Action being audited. */
  action: AuditAction;
  /** Tenant identifier (empty for single-tenant / default mode). */
  tenantId: string;
  /** API key identifier, when auth is enabled. */
  apiKeyId?: string;
  /** Human/user identifier, when available. */
  userId?: string;
  /** Request IP address. */
  ip?: string;
  /** Request user agent. */
  userAgent?: string;
  /** Resource id the action targets (job id, profile id, etc.). */
  resourceId?: string;
  /** High-level outcome: success, failure, denied, rate_limited. */
  outcome: "success" | "failure" | "denied" | "rate_limited";
  /** Human-readable message. */
  message: string;
  /** Structured metadata; never include secrets or raw LLM keys. */
  metadata?: Record<string, unknown>;
}
