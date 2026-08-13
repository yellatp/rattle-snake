import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mockResponseFor } from "../src/llm/mock.js";

export type FakeLLMKind = "openai" | "anthropic" | "google";

export interface FakeLLMServer {
  url: string;
  requests: number;
  close: () => Promise<void>;
}

interface ChatMessage {
  role?: string;
  content?: string;
}

function readBody(req: { on: (event: "data", cb: (chunk: Buffer) => void) => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function json(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Start a local fake LLM server that speaks one provider wire format and serves
 * `mockResponseFor()` responses. Used by the functional test suite to prove each
 * provider adapter works over real HTTP without any API keys.
 *
 * `delayMs` (optional) throttles responses so live SSE streaming can be observed
 * over the full debate window.
 */
export async function startFakeLLMServer(
  kind: FakeLLMKind,
  port: number,
  delayMs = 0,
): Promise<FakeLLMServer> {
  let requests = 0;

  const server = createServer(async (req, res) => {
    if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
    requests += 1;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

    const body = await readBody(req);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body);
    } catch {
      return json(res, 400, { error: "bad json" });
    }

    if (kind === "openai") {
      const messages = (parsed.messages ?? []) as ChatMessage[];
      const system = messages.find((m) => m.role === "system")?.content ?? "";
      const user = messages.filter((m) => m.role === "user").map((m) => m.content ?? "").join("\n");
      return json(res, 200, {
        id: "fake-openai",
        choices: [{ index: 0, message: { role: "assistant", content: mockResponseFor(system, user) } }],
      });
    }

    if (kind === "anthropic") {
      const system = (parsed.system as string) ?? "";
      const user = ((parsed.messages as ChatMessage[]) ?? [])
        .map((m) => m.content ?? "")
        .join("\n");
      return json(res, 200, {
        id: "fake-anthropic",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: mockResponseFor(system, user) }],
      });
    }

    // google
    const system = ((parsed.systemInstruction as { parts?: { text?: string }[] } | undefined)
      ?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    const user = ((parsed.contents as { parts?: { text?: string }[] }[] | undefined) ?? [])
      .flatMap((c) => c.parts ?? [])
      .map((p) => p.text ?? "")
      .join("\n");
    return json(res, 200, {
      candidates: [{ content: { role: "model", parts: [{ text: mockResponseFor(system, user) }] } }],
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  server.on("error", (err) => console.error("[fake-llm] server error:", err.message));
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    get requests() {
      return requests;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
