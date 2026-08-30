import { describe, expect, it } from "vitest";
import type { LLMClient } from "../llm/types.js";
import { extractProfileFromResume } from "./importResume.js";

const LONG_RESUME =
  "Rohan Mehta is a data scientist with seven years of experience building machine learning products.";

function fakeClient(reply: string): LLMClient {
  return {
    provider: "mock",
    model: "mock",
    complete: async () => reply,
  };
}

describe("extractProfileFromResume", () => {
  it("extracts the profile summary and splits newline-joined bullets", async () => {
    const reply = `{
      "personalInfo": { "firstName": "Rohan", "lastName": "Mehta", "headline": "Data Scientist" },
      "summary": "Data scientist with 7 years in applied ML.",
      "experience": [
        {
          "title": "Senior Data Scientist",
          "company": "Analytics Inc",
          "bullets": "- Built churn models\\n- Shipped an ML platform\\n• Led a team of 4"
        }
      ]
    }`;
    const result = await extractProfileFromResume(LONG_RESUME, fakeClient(reply));
    expect(result.summary).toBe("Data scientist with 7 years in applied ML.");
    expect(result.experience?.[0]?.bullets).toEqual([
      "Built churn models",
      "Shipped an ML platform",
      "Led a team of 4",
    ]);
  });

  it("strips bullet markers from already-separated bullets", async () => {
    const reply = `{
      "experience": [
        { "title": "Engineer", "company": "Co", "bullets": ["- one", "* two", "1. three"] }
      ]
    }`;
    const result = await extractProfileFromResume(LONG_RESUME, fakeClient(reply));
    expect(result.experience?.[0]?.bullets).toEqual(["one", "two", "three"]);
  });

  it("returns an empty object when the reply is not parseable JSON", async () => {
    const result = await extractProfileFromResume(LONG_RESUME, fakeClient("sorry, no json here"));
    expect(result).toEqual({});
  });
});
