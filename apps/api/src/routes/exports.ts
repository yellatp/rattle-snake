import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import type { AppConfig } from "../config.js";
import type { JobStore } from "../db/store.js";
import { removeDossier } from "../exports/dossier.js";

// Whitelist of files the dossier writer produces; serving anything else (or
// a path traversal like `../`) is rejected.
const EXPORT_FILES = new Set(["discussion.md", "discussion.json", "resume.md", "resume.json"]);

const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Browsable auto-saved results: list dossiers and download their files. */
export function createExportsRouter(store: JobStore, config: AppConfig) {
  const router = new Hono();

  const tenantId = (c: { get: (key: "tenantId") => string }) => c.get("tenantId") ?? "default";

  // GET /api/exports — every saved dossier with its file sizes, joined to the
  // job's latest summary (role, verdict, status) when the job still exists.
  // Tenant-scoped: dossiers whose job is not visible to the caller's tenant
  // are listed without metadata and cannot be downloaded below.
  router.get("/", (c) => {
    if (!existsSync(config.exportsDir)) return c.json({ exports: [] });

    const tenant = tenantId(c);
    const exports = readdirSync(config.exportsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const dir = path.join(config.exportsDir, entry.name);
        const files = readdirSync(dir)
          .filter((name) => EXPORT_FILES.has(name))
          .sort((a, b) => [...EXPORT_FILES].indexOf(a) - [...EXPORT_FILES].indexOf(b))
          .map((name) => ({ name, size: statSync(path.join(dir, name)).size }));
        const job = store.get(entry.name, tenant);
        return {
          jobId: entry.name,
          files,
          ...(job
            ? {
                domain: job.domain,
                role: job.jdMeta?.role ?? job.roleSlug ?? null,
                status: job.status,
                verdict: job.finalVerdict ?? null,
                updatedAt: job.updatedAt,
              }
            : {}),
        };
      })
      .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));

    return c.json({ exports });
  });

  // GET /api/exports/:jobId/:file — download one artifact as an attachment.
  // Only served when the caller's tenant can see the owning job.
  router.get("/:jobId/:file", (c) => {
    const jobId = c.req.param("jobId");
    const file = c.req.param("file");
    if (!JOB_ID_PATTERN.test(jobId) || !EXPORT_FILES.has(file)) {
      return c.json({ error: "Unknown export file." }, 404);
    }
    if (!store.get(jobId, tenantId(c))) return c.json({ error: "Export file not found." }, 404);
    const full = path.join(config.exportsDir, jobId, file);
    if (!existsSync(full)) return c.json({ error: "Export file not found." }, 404);

    const type = file.endsWith(".json") ? "application/json" : "text/markdown";
    return c.body(readFileSync(full), 200, {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${jobId}-${file}"`,
    });
  });

  // DELETE /api/exports/:jobId — remove a saved dossier from disk. The store
  // row (the run) is left untouched; use DELETE /api/jobs/:id to remove both.
  router.delete("/:jobId", (c) => {
    const jobId = c.req.param("jobId");
    if (!JOB_ID_PATTERN.test(jobId)) return c.json({ error: "Unknown export." }, 404);
    if (!store.get(jobId, tenantId(c))) return c.json({ error: "Unknown export." }, 404);
    removeDossier(jobId, config.exportsDir);
    return c.body(null, 204);
  });

  return router;
}
