import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  llmConnectionSchema,
  llmConnectionUpdateSchema,
  profileCreateSchema,
  profileMasterSchema,
  profilePinSchema,
  profileSchema,
  profileUpdateSchema,
  resumeImportSchema,
  savedJdSchema,
  savedResumeSchema,
  type LlmConnectionInput,
  type LlmConnectionUpdateInput,
  type ProfileCreateInput,
  type ProfileInput,
  type ProfileMasterInput,
  type ProfilePinInput,
  type ProfileUpdateInput,
  type ResumeImportInput,
  type SavedJdInput,
  type SavedResumeInput,
} from "@rattlesnake/shared";
import type { AppConfig } from "../config.js";
import type { AuditLogger } from "../audit/logger.js";
import type { JobStore } from "../db/store.js";
import type { LLMClient } from "../llm/client.js";
import { resolveLlmClientForRequest } from "../llm/resolve.js";
import { extractProfileFromResume } from "../resume/importResume.js";
import { listTemplateInfo } from "../resume/roleRegistry.js";

export function createSettingsRouter(
  store: JobStore,
  llm: LLMClient,
  config: AppConfig,
  auditLogger?: AuditLogger,
) {
  const router = new Hono();

  const tenantId = (c: { get: (key: "tenantId") => string }) => c.get("tenantId") ?? "default";

  function audit(
    c: { get: (key: "tenantId" | "apiKeyId") => string },
    action: Parameters<AuditLogger["log"]>[0]["action"],
    outcome: Parameters<AuditLogger["log"]>[0]["outcome"],
    message: string,
    resourceId?: string,
  ) {
    if (!auditLogger) return;
    auditLogger.log({
      timestamp: new Date().toISOString(),
      action,
      tenantId: c.get("tenantId") ?? "default",
      apiKeyId: c.get("apiKeyId"),
      outcome,
      message,
      resourceId,
    });
  }

  // --- Profile (backward-compat single-user view) -------------------------------
  router.get("/profile", (c) => c.json(store.getProfile(tenantId(c))));
  router.put("/profile", zValidator("json", profileSchema), (c) => {
    const body = c.req.valid("json") as ProfileInput;
    const profile = store.upsertProfile(body, tenantId(c));
    audit(c, "profile.updated", "success", "Master profile updated", profile.id);
    return c.json(profile);
  });

  // --- Profiles (WS-6 multi-profile) --------------------------------------------
  router.get("/profiles", (c) => c.json({ items: store.listProfiles(tenantId(c)) }));
  router.post("/profiles", zValidator("json", profileCreateSchema), (c) => {
    try {
      const item = store.createProfile(c.req.valid("json") as ProfileCreateInput, tenantId(c));
      audit(c, "profile.created", "success", "Profile created", item.id);
      return c.json(item, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Profile creation failed";
      audit(c, "profile.created", "failure", message);
      return c.json({ error: message }, 400);
    }
  });
  router.put("/profiles/:id", zValidator("json", profileUpdateSchema), (c) => {
    const id = c.req.param("id");
    const updated = store.updateProfile(id, c.req.valid("json") as ProfileUpdateInput, tenantId(c));
    if (!updated) return c.json({ error: "Profile not found" }, 404);
    audit(c, "profile.updated", "success", "Profile updated", id);
    return c.json(updated);
  });
  router.put("/profiles/:id/master", zValidator("json", profileMasterSchema), (c) => {
    const body = c.req.valid("json") as ProfileMasterInput;
    const id = c.req.param("id");
    if (!store.getProfileById(id, tenantId(c))) return c.json({ error: "Profile not found" }, 404);
    const updated = store.setMasterProfile(id, body.pin || undefined, tenantId(c));
    if (!updated) {
      audit(c, "profile.master_set", "failure", "PIN required to set master profile", id);
      return c.json(
        { error: "This profile is PIN-protected. Enter its PIN to set it as the master resume." },
        403,
      );
    }
    audit(c, "profile.master_set", "success", "Master profile set", id);
    return c.json(updated);
  });

  // POST /api/profile/import-resume — convert a pasted/uploaded resume into a
  // structured candidate profile (JSON). Uses the Settings default LLM
  // connection (or the server's env client); the raw text is never persisted.
  router.post("/profile/import-resume", zValidator("json", resumeImportSchema), async (c) => {
    const body = c.req.valid("json") as ResumeImportInput;
    const resolved = resolveLlmClientForRequest(store, config, llm, {}, tenantId(c));
    if (resolved.error) {
      audit(c, "profile.imported", "failure", `LLM resolution failed: ${resolved.error}`);
      return c.json({ error: resolved.error }, 400);
    }
    try {
      const extracted = await extractProfileFromResume(body.resumeText, resolved.client);
      audit(c, "profile.imported", "success", "Resume imported into profile");
      return c.json(extracted);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Resume import failed";
      audit(c, "profile.imported", "failure", message);
      return c.json({ error: message }, 500);
    }
  });
  router.put("/profiles/:id/pin", zValidator("json", profilePinSchema), (c) => {
    const body = c.req.valid("json") as ProfilePinInput;
    const id = c.req.param("id");
    const updated = store.setProfilePin(id, body.pin, tenantId(c));
    if (!updated) return c.json({ error: "Profile not found" }, 404);
    audit(c, "profile.pin_set", "success", "Profile PIN updated", id);
    return c.json(updated);
  });
  router.delete("/profiles/:id", (c) => {
    const id = c.req.param("id");
    try {
      const deleted = store.deleteProfile(id, tenantId(c));
      if (!deleted) return c.json({ error: "Profile not found" }, 404);
      audit(c, "profile.deleted", "success", "Profile deleted", id);
      return c.body(null, 204);
    } catch (err) {
      audit(c, "profile.deleted", "failure", err instanceof Error ? err.message : "Deletion failed", id);
      return c.json(
        { error: err instanceof Error ? err.message : "Profile deletion failed" },
        400,
      );
    }
  });

  // --- Resume template catalog -------------------------------------------------
  router.get("/resume/templates", (c) => {
    return c.json({ items: listTemplateInfo() });
  });

  // --- Saved resumes ------------------------------------------------------------
  router.get("/resumes", (c) => c.json({ items: store.listSavedResumes(tenantId(c)) }));
  router.post("/resumes", zValidator("json", savedResumeSchema), (c) => {
    const item = store.createSavedResume(c.req.valid("json") as SavedResumeInput, tenantId(c));
    audit(c, "saved_resume.created", "success", "Saved resume created", item.id);
    return c.json(item, 201);
  });
  router.put("/resumes/:id", zValidator("json", savedResumeSchema), (c) => {
    const id = c.req.param("id");
    const updated = store.updateSavedResume(id, c.req.valid("json") as SavedResumeInput, tenantId(c));
    if (!updated) return c.json({ error: "Saved resume not found" }, 404);
    audit(c, "saved_resume.updated", "success", "Saved resume updated", id);
    return c.json(updated);
  });
  router.delete("/resumes/:id", (c) => {
    const id = c.req.param("id");
    const deleted = store.deleteSavedResume(id, tenantId(c));
    if (!deleted) return c.json({ error: "Saved resume not found" }, 404);
    audit(c, "saved_resume.deleted", "success", "Saved resume deleted", id);
    return c.body(null, 204);
  });

  // --- Saved job descriptions ----------------------------------------------------
  router.get("/jds", (c) => c.json({ items: store.listSavedJds(tenantId(c)) }));
  router.post("/jds", zValidator("json", savedJdSchema), (c) => {
    const item = store.createSavedJd(c.req.valid("json") as SavedJdInput, tenantId(c));
    audit(c, "saved_jd.created", "success", "Saved JD created", item.id);
    return c.json(item, 201);
  });
  router.put("/jds/:id", zValidator("json", savedJdSchema), (c) => {
    const id = c.req.param("id");
    const updated = store.updateSavedJd(id, c.req.valid("json") as SavedJdInput, tenantId(c));
    if (!updated) return c.json({ error: "Saved JD not found" }, 404);
    audit(c, "saved_jd.updated", "success", "Saved JD updated", id);
    return c.json(updated);
  });
  router.delete("/jds/:id", (c) => {
    const id = c.req.param("id");
    const deleted = store.deleteSavedJd(id, tenantId(c));
    if (!deleted) return c.json({ error: "Saved JD not found" }, 404);
    audit(c, "saved_jd.deleted", "success", "Saved JD deleted", id);
    return c.body(null, 204);
  });

  // --- LLM connections -------------------------------------------------------------
  router.get("/llm-connections", (c) => c.json({ items: store.listLlmConnections(tenantId(c)) }));
  router.post("/llm-connections", zValidator("json", llmConnectionSchema), (c) => {
    const item = store.createLlmConnection(c.req.valid("json") as LlmConnectionInput, tenantId(c));
    audit(c, "llm_connection.created", "success", "LLM connection created", item.id);
    return c.json(item, 201);
  });
  router.put("/llm-connections/:id", zValidator("json", llmConnectionUpdateSchema), (c) => {
    const id = c.req.param("id");
    const updated = store.updateLlmConnection(id, c.req.valid("json") as LlmConnectionUpdateInput, tenantId(c));
    if (!updated) return c.json({ error: "LLM connection not found" }, 404);
    audit(c, "llm_connection.updated", "success", "LLM connection updated", id);
    return c.json(updated);
  });
  router.delete("/llm-connections/:id", (c) => {
    const id = c.req.param("id");
    const deleted = store.deleteLlmConnection(id, tenantId(c));
    if (!deleted) return c.json({ error: "LLM connection not found" }, 404);
    audit(c, "llm_connection.deleted", "success", "LLM connection deleted", id);
    return c.body(null, 204);
  });

  return router;
}
