import type { AdapterInput, AdapterResult, AdapterTarget, DeliveryResult, InputAdapter, OutputAdapter } from "./registry.js";
import { registerInputAdapter, registerOutputAdapter } from "./registry.js";

/**
 * The two adapters shipped with the plug-and-play layer (design plan R4):
 * fetching a job description from a public URL, and delivering envelopes to
 * tenant webhooks (refactor of the existing dispatcher).
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_JD_TEXT = 200_000;

export class UrlJdInputAdapter implements InputAdapter {
  id = "url-jd";
  kinds = ["jd_url" as const];

  async fetch(input: AdapterInput): Promise<AdapterResult> {
    let url: URL;
    try {
      url = new URL(input.value);
    } catch {
      return { ok: false, error: "Not a valid URL." };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "Only http(s) URLs are supported." };
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        return { ok: false, error: `Fetch failed with HTTP ${res.status}.` };
      }
      const html = await res.text();
      const text = htmlToText(html).slice(0, MAX_JD_TEXT);
      if (text.trim().length < 40) {
        return { ok: false, error: "The page did not contain enough text to be a job description." };
      }
      return { ok: true, text, meta: { finalUrl: url.toString(), bytes: html.length } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export class WebhookOutputAdapter implements OutputAdapter {
  id = "webhook";
  kind = "webhook";

  async deliver(envelope: Parameters<OutputAdapter["deliver"]>[0], target: AdapterTarget): Promise<DeliveryResult> {
    const body = JSON.stringify(envelope);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "rattle-snake-webhook/1.0",
    };
    let signature: string | undefined = undefined;
    if (target.secret) {
      signature = target.secret;
    }
    if (signature) {
      const { createHmac } = await import("node:crypto");
      headers["X-Webhook-Signature"] = `sha256=${createHmac("sha256", signature).update(body).digest("hex")}`;
    }
    try {
      const res = await fetch(target.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.status >= 200 && res.status < 300, status: res.status };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export function registerBuiltInAdapters(): void {
  registerInputAdapter(new UrlJdInputAdapter());
  registerOutputAdapter(new WebhookOutputAdapter());
}

export type { AdapterInput, AdapterResult, AdapterTarget, DeliveryResult };
