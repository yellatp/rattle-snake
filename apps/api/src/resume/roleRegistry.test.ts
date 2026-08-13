import { describe, expect, it } from "vitest";
import {
  ALL_ROLE_SLUGS,
  DOMAIN_ROLES,
  getRolePrompt,
  getTemplate,
  resolveRoleSlug,
} from "./roleRegistry.js";

describe("roleRegistry", () => {
  it("registers all 32 role templates + prompts from the V1 port", () => {
    expect(ALL_ROLE_SLUGS).toHaveLength(32);
    for (const slug of ALL_ROLE_SLUGS) {
      expect(getTemplate(slug), `${slug} template`).toBeTruthy();
      expect(getRolePrompt(slug), `${slug} prompt`).toBeTruthy();
    }
  });

  it("every domain has a flagship role and a non-empty candidate list", () => {
    for (const domain of Object.keys(DOMAIN_ROLES) as (keyof typeof DOMAIN_ROLES)[]) {
      expect(DOMAIN_ROLES[domain].length).toBeGreaterThan(0);
      for (const slug of DOMAIN_ROLES[domain]) {
        expect(ALL_ROLE_SLUGS).toContain(slug);
      }
    }
  });

  it("each template exposes the sections the engine depends on", () => {
    for (const slug of ALL_ROLE_SLUGS) {
      const t = getTemplate(slug)!;
      expect(t.slug).toBe(slug);
      expect(t.role.length).toBeGreaterThan(0);
      expect(Array.isArray(t.ats_keywords)).toBe(true);
      expect(t.sections).toBeTruthy();
    }
  });
});

describe("resolveRoleSlug — JD-based role detection", () => {
  it("SWE domain falls back to the flagship swe role for a backend JD", () => {
    const jd =
      "Senior Backend Engineer. TypeScript, Go, distributed systems, microservices, Kafka, PostgreSQL.";
    expect(resolveRoleSlug("SWE", jd)).toBe("swe");
  });

  it("picks cloud_engineer for a cloud-focused SWE JD", () => {
    const jd =
      "Cloud engineer for EKS and GKE. Kubernetes, Terraform, ArgoCD, Helm, Istio, VPC, SLO, multi-region failover.";
    expect(resolveRoleSlug("SWE", jd)).toBe("cloud_engineer");
  });

  it("picks data_scientist for a statistics-heavy DATA_AI JD", () => {
    const jd =
      "Data scientist. Machine learning, statistical modeling, causal inference, A/B testing, experiment design, XGBoost.";
    expect(resolveRoleSlug("DATA_AI", jd)).toBe("data_scientist");
  });

  it("picks pricing_analyst for a FINANCE pricing JD", () => {
    const jd =
      "Pricing analyst. Pricing strategy, price elasticity, revenue modeling, LTV, ARPU, promotion analysis.";
    expect(resolveRoleSlug("FINANCE", jd)).toBe("pricing_analyst");
  });

  it("returns a known role even for a vague JD (flagship fallback)", () => {
    const slug = resolveRoleSlug("FINANCE", "We are hiring someone to join our team.");
    expect(DOMAIN_ROLES.FINANCE).toContain(slug);
  });

  it("prefers an explicit title signal over keyword overlap", () => {
    // Heavy data-engineering keywords, but the title names a backend SWE role.
    const jd =
      "Senior Backend Engineer — FinTech Payments Platform. TypeScript, Go, distributed systems, microservices, concurrency, idempotency. Event-driven architecture (Kafka, SQS). PostgreSQL at scale. PCI-DSS awareness. Production debugging and on-call ownership.";
    expect(resolveRoleSlug("SWE", jd)).toBe("swe");
  });

  it("matches a capitalized title in the JD (case-insensitive)", () => {
    expect(resolveRoleSlug("DATA_AI", "Senior Data Scientist, Pricing Team")).toBe(
      "data_scientist",
    );
  });

  it("keeps the title within the job's domain", () => {
    // The JD mentions a data title but the domain is SWE; no SWE title signal,
    // so it falls back to keyword scoring rather than crossing domains.
    const jd =
      "We need a data engineer who can build pipelines. Airflow, Spark, dbt, BigQuery, DBT models.";
    expect(resolveRoleSlug("SWE", jd)).toBe("data_engineer");
  });
});
