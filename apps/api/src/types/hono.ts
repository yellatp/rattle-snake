import type { AuditLogger } from "../audit/logger.js";

declare module "hono" {
  interface ContextVariableMap {
    tenantId: string;
    apiKeyId: string;
    audit: AuditLogger;
  }
}

export type {};
