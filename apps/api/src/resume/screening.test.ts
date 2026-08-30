import { describe, expect, it } from "vitest";
import {
  auditScreening,
  checklistKeywords,
  getScreeningChecklist,
} from "./screening.js";

describe("screening checklists", () => {
  it("provides a baseline checklist for every registered role slug", () => {
    const slugs = [
      "swe", "ai_engineer", "ai_analyst", "ai_specialist", "bi_analyst",
      "business_analyst", "business_strategist", "cloud_engineer",
      "cloud_security_engineer", "computer_vision_engineer", "cybersecurity_analyst",
      "data_analyst", "data_architect", "data_engineer", "data_platform_engineer",
      "data_scientist", "devops", "gtm_analyst", "marketing_analyst",
      "marketing_strategist", "market_research_analyst", "mlops_engineer",
      "ml_engineer", "nlp_engineer", "operations_analyst", "penetration_tester",
      "pricing_analyst", "product_analyst", "product_manager", "qa_engineer",
      "research_scientist", "soc_analyst",
    ];
    for (const slug of slugs) {
      expect(getScreeningChecklist(slug).length).toBeGreaterThan(0);
    }
  });

  it("returns an empty list for an unknown role", () => {
    expect(getScreeningChecklist("nonexistent_role")).toEqual([]);
  });

  it("swe checklist carries the Tsenta full-stack baseline", () => {
    const items = getScreeningChecklist("swe");
    const joined = items.join("\n");
    expect(joined).toContain("TypeScript");
    expect(joined).toContain("REST API or RESTful API");
    expect(joined).toContain("SQL");
    expect(joined).toContain("Cloud");
  });
});

describe("checklistKeywords", () => {
  it("splits on commas, slashes and parentheses", () => {
    expect(checklistKeywords("SQL, data visualization (Tableau, Power BI, Looker)"))
      .toContain("sql");
    expect(checklistKeywords("SQL, data visualization (Tableau, Power BI, Looker)"))
      .toContain("power bi");
    expect(checklistKeywords("REST API or RESTful API")).toContain("rest api");
  });

  it("drops stopwords and very short tokens", () => {
    expect(checklistKeywords("a, an, the, of, SQL, or")).toEqual(["sql"]);
  });
});

describe("auditScreening", () => {
  it("counts matched and missing baseline items", () => {
    const text = `
      Built REST APIs in TypeScript and Go on AWS with PostgreSQL.
      Designed Redis caching and shipped CI/CD pipelines.
    `;
    const checklist = [
      "SQL, Python",
      "Cloud (AWS, GCP, or Azure)",
      "React or React Native",
      "TypeScript, JavaScript, HTML, CSS",
    ];
    const result = auditScreening(text, checklist);
    // "SQL, Python" -> sql|python (SQL matched), "Cloud..." -> aws (matched),
    // "React..." -> react (missing), "TypeScript..." -> typescript (matched).
    expect(result.matched).toBe(3);
    expect(result.total).toBe(4);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toContain("React");
  });

  it("reports every item missing when nothing matches", () => {
    const result = auditScreening("hello world", ["SQL", "Kubernetes", "Tableau"]);
    expect(result.matched).toBe(0);
    expect(result.missing).toHaveLength(3);
  });

  it("never counts items that yield no keywords", () => {
    const result = auditScreening("anything", ["a", "an", "or", "the"]);
    expect(result.matched).toBe(0);
    expect(result.missing).toHaveLength(0);
  });
});
