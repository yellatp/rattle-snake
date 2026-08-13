import { describe, expect, it } from "vitest";
import { extractJDKeywords, resumeToText, scoreResume } from "./ats.js";

describe("extractJDKeywords", () => {
  it("returns template keywords plus high-frequency JD terms", () => {
    const jd =
      "We need deep Kubernetes expertise, Kubernetes, Docker and Docker, SQL, SQL, Go";
    const kws = extractJDKeywords(jd, ["Terraform"]);
    expect(kws).toContain("terraform");
    expect(kws).toContain("kubernetes");
    expect(kws).toContain("docker");
    expect(kws).toContain("sql");
  });

  it("drops stop words", () => {
    const kws = extractJDKeywords("The team and the work and the role are great", []);
    expect(kws).not.toContain("the");
    expect(kws).not.toContain("and");
  });
});

describe("scoreResume", () => {
  it("marks exact keyword matches as found", () => {
    const resume = "Expert in Kubernetes orchestration, Docker, SQL, Go";
    const jd = "Kubernetes Kubernetes Docker Docker SQL SQL";
    const result = scoreResume(resume, jd, []);
    for (const kw of ["kubernetes", "docker", "sql"]) {
      expect(result.matched.map((m) => m.keyword)).toContain(kw);
    }
    expect(result.missing).not.toContain(
      expect.objectContaining({ keyword: "kubernetes" }),
    );
    expect(result.score).toBeGreaterThan(0);
  });

  it("lists missing keywords with a lower score", () => {
    const resume = "Strong Kubernetes background";
    const jd = "Kubernetes Kubernetes Docker Docker SQL SQL";
    const result = scoreResume(resume, jd, []);
    expect(result.matched.map((m) => m.keyword)).toContain("kubernetes");
    expect(result.missing.map((m) => m.keyword)).toEqual(
      expect.arrayContaining(["docker", "sql"]),
    );
    expect(result.topMissing).toEqual(expect.arrayContaining(["docker", "sql"]));
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });

  it("finds near-miss terms via fuzzy matching", () => {
    // JD has a typo "visualizaton"; the resume has the correct spelling.
    const resume = "I used visualization tools for dashboards";
    const jd = "Experience with visualizaton and dashboards";
    const result = scoreResume(resume, jd, []);
    const viz = result.matched.find((m) => m.keyword.includes("visualizat"));
    expect(viz?.found).toBe(true);
  });

  it("includes role-template keywords in the check list", () => {
    const result = scoreResume(
      "Built ETL pipelines with Airflow",
      "Data pipeline work required",
      ["Airflow", "Snowflake"],
    );
    expect(result.matched.map((m) => m.keyword)).toContain("airflow");
  });
});

describe("resumeToText", () => {
  it("flattens structured resume JSON to plain text", () => {
    const json = JSON.stringify({
      contact: { name: "Rohan Mehta" },
      sections: {
        summary: { content: "Backend engineer." },
        skills: { categories: [{ name: "Languages", items: ["Go", "TypeScript"] }] },
        experience: [
          { title: "Senior SWE", company: "Acme", bullets: ["Reduced latency by 40%."] },
        ],
        education: [{ degree: "B.Tech", institution: "NIT" }],
        certifications: ["AWS"],
        coreCompetencies: ["System Design"],
      },
    });
    const text = resumeToText(json);
    expect(text).toContain("Rohan Mehta");
    expect(text).toContain("TypeScript");
    expect(text).toContain("Reduced latency by 40%.");
    expect(text).toContain("B.Tech");
    expect(text).toContain("System Design");
  });

  it("passes raw (non-JSON) text through unchanged", () => {
    expect(resumeToText("# Rohan\nPlain text resume.")).toBe("# Rohan\nPlain text resume.");
  });
});
