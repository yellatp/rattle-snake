import type { AuditLogger } from "../audit/logger.js";

declare module "hono" {
  interface ContextVariableMap {
    tenantId: string;
    apiKeyId: string;
    audit: AuditLogger;
    userId?: string;
    sessionId?: string;
    role?: "owner" | "admin" | "member";
  }
}

export type {};
