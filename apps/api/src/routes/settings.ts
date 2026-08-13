import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  llmConnectionSchema,
  llmConnectionUpdateSchema,
  profileSchema,
  savedJdSchema,
  savedResumeSchema,
  type LlmConnectionInput,
  type LlmConnectionUpdateInput,
  type ProfileInput,
  type SavedJdInput,
  type SavedResumeInput,
} from "@rattlesnake/shared";
import type { JobStore } from "../db/store.js";

/**
 * Profile & settings API: the single-user profile, saved resumes/JDs, and
 * stored LLM API connections (keys encrypted at rest, never returned).
 * Mounted at /api (paths below are relative).
 */
export function createSettingsRouter(store: JobStore) {
  const router = new Hono();

  // --- Profile ---------------------------------------------------------------
  router.get("/profile", (c) => c.json(store.getProfile()));
  router.put("/profile", zValidator("json", profileSchema), (c) => {
    const body = c.req.valid("json") as ProfileInput;
    return c.json(store.upsertProfile(body));
  });

  // --- Saved resumes ------------------------------------------------------------
  router.get("/resumes", (c) => c.json({ items: store.listSavedResumes() }));
  router.post("/resumes", zValidator("json", savedResumeSchema), (c) => {
    const item = store.createSavedResume(c.req.valid("json") as SavedResumeInput);
    return c.json(item, 201);
  });
  router.put("/resumes/:id", zValidator("json", savedResumeSchema), (c) => {
    const updated = store.updateSavedResume(
      c.req.param("id"),
      c.req.valid("json") as SavedResumeInput,
    );
    return updated ? c.json(updated) : c.json({ error: "Saved resume not found" }, 404);
  });
  router.delete("/resumes/:id", (c) => {
    return store.deleteSavedResume(c.req.param("id"))
      ? c.body(null, 204)
      : c.json({ error: "Saved resume not found" }, 404);
  });

  // --- Saved job descriptions ----------------------------------------------------
  router.get("/jds", (c) => c.json({ items: store.listSavedJds() }));
  router.post("/jds", zValidator("json", savedJdSchema), (c) => {
    const item = store.createSavedJd(c.req.valid("json") as SavedJdInput);
    return c.json(item, 201);
  });
  router.put("/jds/:id", zValidator("json", savedJdSchema), (c) => {
    const updated = store.updateSavedJd(
      c.req.param("id"),
      c.req.valid("json") as SavedJdInput,
    );
    return updated ? c.json(updated) : c.json({ error: "Saved JD not found" }, 404);
  });
  router.delete("/jds/:id", (c) => {
    return store.deleteSavedJd(c.req.param("id"))
      ? c.body(null, 204)
      : c.json({ error: "Saved JD not found" }, 404);
  });

  // --- LLM connections -------------------------------------------------------------
  router.get("/llm-connections", (c) => c.json({ items: store.listLlmConnections() }));
  router.post("/llm-connections", zValidator("json", llmConnectionSchema), (c) => {
    const item = store.createLlmConnection(c.req.valid("json") as LlmConnectionInput);
    return c.json(item, 201);
  });
  router.put("/llm-connections/:id", zValidator("json", llmConnectionUpdateSchema), (c) => {
    const updated = store.updateLlmConnection(
      c.req.param("id"),
      c.req.valid("json") as LlmConnectionUpdateInput,
    );
    return updated ? c.json(updated) : c.json({ error: "LLM connection not found" }, 404);
  });
  router.delete("/llm-connections/:id", (c) => {
    return store.deleteLlmConnection(c.req.param("id"))
      ? c.body(null, 204)
      : c.json({ error: "LLM connection not found" }, 404);
  });

  return router;
}
