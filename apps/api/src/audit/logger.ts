import pino from "pino";
import type { AuditEvent } from "./types.js";

export interface AuditLogger {
  log(event: AuditEvent): void;
  child(bindings: Record<string, unknown>): AuditLogger;
}

class PinoAuditLogger implements AuditLogger {
  private logger: pino.Logger;

  constructor(logger: pino.Logger) {
    this.logger = logger;
  }

  log(event: AuditEvent): void {
    this.logger.info({ audit: event });
  }

  child(bindings: Record<string, unknown>): AuditLogger {
    return new PinoAuditLogger(this.logger.child(bindings));
  }
}

export function createAuditLogger(options?: { pretty?: boolean; level?: string }): AuditLogger {
  const level = options?.level ?? (process.env.NODE_ENV === "production" ? "info" : "debug");
  const pretty = options?.pretty ?? process.env.NODE_ENV !== "production";

  const base = pino({
    level,
    base: { service: "rattle-snake-v2" },
    transport: pretty
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" },
        }
      : undefined,
  });

  return new PinoAuditLogger(base);
}

export const defaultLogger = createAuditLogger();
