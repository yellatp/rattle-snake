import { describe, expect, it } from "vitest";
import type { LLMClient } from "../llm/types.js";
import { detectRoleWithLlm } from "./roleDetect.js";

const BACKEND_JD = `Senior Backend Engineer. Build low-latency payment services with
TypeScript, Go, PostgreSQL, Kafka, and distributed systems design.`;

const DATA_JD = `Data Scientist. Build predictive models with Python, SQL, and
machine learning, and ship A/B tests for the growth team.`;

function stubLLM(response: string): LLMClient {
  return {
    provider: "stub",
    model: "stub",
    async complete() {
      return response;
    },
  };
}

describe("detectRoleWithLlm", () => {
  it("returns the slug the LLM classified from the JD", async () => {
    const llm = stubLLM(JSON.stringify({ role: "data_scientist", reason: "modelling focus" }));
    await expect(detectRoleWithLlm("ML_ENGINEERING", DATA_JD, llm)).resolves.toBe("data_scientist");
  });

  it("falls back to keyword detection when the reply names an unknown slug", async () => {
    const llm = stubLLM(JSON.stringify({ role: "made_up_role", reason: "no such slug" }));
    await expect(detectRoleWithLlm("SDE", BACKEND_JD, llm)).resolves.toBe("backend_engineer");
  });

  it("falls back to keyword detection on malformed output", async () => {
    const llm = stubLLM("[STRONG HIRE] - evidence outweighs risk");
    await expect(detectRoleWithLlm("SDE", BACKEND_JD, llm)).resolves.toBe("backend_engineer");
  });

  it("falls back to keyword detection when the call throws", async () => {
    const llm: LLMClient = {
      provider: "stub",
      model: "stub",
      async complete() {
        throw new Error("provider down");
      },
    };
    await expect(detectRoleWithLlm("ML_ENGINEERING", DATA_JD, llm)).resolves.toBe("data_scientist");
  });
});
