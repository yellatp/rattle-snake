import { afterEach, describe, expect, it, vi } from "vitest";
import { createEnvelope, ENVELOPE_SPEC, envelopeSchema } from "@rattlesnake/shared";
import {
  getInputAdapter,
  getOutputAdapter,
  listInputAdapters,
  registerInputAdapter,
  registerOutputAdapter,
  resetAdapters,
} from "./registry.js";
import { registerBuiltInAdapters, UrlJdInputAdapter } from "./builtIn.js";
import { dispatchWebhook } from "../webhooks/dispatcher.js";
import type { JobEvent } from "@rattlesnake/shared";

describe("envelope", () => {
  it("creates a spec-compliant envelope with context", () => {
    const envelope = createEnvelope("job.completed", 1, { hello: true }, {
      tenantId: "org_1",
      jobId: "run-001",
    });
    expect(envelope.spec).toBe(ENVELOPE_SPEC);
    expect(envelope.type).toBe("job.completed");
    expect(envelope.tenantId).toBe("org_1");
    expect(envelope.jobId).toBe("run-001");
    const parsed = envelopeSchema.safeParse(envelope);
    expect(parsed.success).toBe(true);
  });
});

describe("adapter registry", () => {
  afterEach(() => resetAdapters());

  it("registers and resolves adapters by id", () => {
    registerBuiltInAdapters();
    expect(getInputAdapter("url-jd")).toBeInstanceOf(UrlJdInputAdapter);
    expect(getOutputAdapter("webhook")).toBeTruthy();
    expect(listInputAdapters().length).toBe(1);
    resetAdapters();
    expect(getInputAdapter("url-jd")).toBeUndefined();
  });

  it("accepts custom adapters", () => {
    registerInputAdapter({ id: "custom", kinds: ["jd_text"], fetch: async () => ({ ok: true, text: "x" }) });
    expect(getInputAdapter("custom")?.kinds).toEqual(["jd_text"]);
  });
});

describe("UrlJdInputAdapter", () => {
  const adapter = new UrlJdInputAdapter();

  afterEach(() => vi.unstubAllGlobals());

  it("rejects invalid and non-http URLs without fetching", async () => {
    expect((await adapter.fetch({ value: "not a url" })).ok).toBe(false);
    expect((await adapter.fetch({ value: "ftp://example.com/x" })).ok).toBe(false);
  });

  it("fetches a URL, strips HTML, and returns the text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          "<html><head><script>evil()</script></head><body><h1>Senior Engineer</h1><p>We build payments with Kafka and PostgreSQL.</p></body></html>",
      }),
    );
    const result = await adapter.fetch({ value: "https://jobs.example.com/role" });
    expect(result.ok).toBe(true);
    expect(result.text).toContain("Senior Engineer");
    expect(result.text).toContain("Kafka and PostgreSQL");
    expect(result.text).not.toContain("evil");
    expect(result.text).not.toContain("<h1>");
  });

  it("reports HTTP failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = await adapter.fetch({ value: "https://jobs.example.com/gone" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("404");
  });
});

describe("webhook envelope delivery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("delivers an envelope body signed with the webhook secret", async () => {
    const captured: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        captured.push({ url, init });
        return { status: 200 };
      }),
    );
    const event: JobEvent = {
      type: "done",
      jobId: "run-009",
      job: { id: "run-009", status: "completed" } as never,
    };
    const result = await dispatchWebhook(
      {
        id: "wh_1",
        url: "https://hooks.example.com/x",
        events: ["job.completed"],
        secret: "shh",
        hasSecret: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      event,
    );
    expect(result.success).toBe(true);
    expect(captured.length).toBe(1);
    const body = JSON.parse(String(captured[0]!.init.body)) as Record<string, unknown>;
    expect(body.spec).toBe(ENVELOPE_SPEC);
    expect(body.type).toBe("job.completed");
    expect(body.jobId).toBe("run-009");
    expect((body.payload as { type: string }).type).toBe("done");
    const headers = captured[0]!.init.headers as Record<string, string>;
    expect(headers["X-Webhook-Signature"]).toMatch(/^sha256=/);
  });
});
