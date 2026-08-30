import { describe, expect, it } from "vitest";
import { REFINE_PLACEHOLDER, mergeSourceIntoTemplate } from "./merge.js";
import type { ResumeTemplate } from "./types.js";

function skeleton(): ResumeTemplate {
  return {
    role: "Software Engineer",
    slug: "swe",
    contact: {},
    sections: {},
    ats_keywords: [],
  };
}

const STRUCTURED_RESUME = `Rohan Mehta
rohan@example.com | +1 555 123 4567 | linkedin.com/in/rohanmehta | github.com/rohanmehta

Summary
Backend engineer with 6 years of experience in low-latency event-driven systems.

Work Experience
Senior Software Engineer — RetailWorks, 2021–Present
- Reduced API latency by 40%.
- Migrated a monolith to Kafka microservices.

Software Engineer — TravelBuddy, 2019–2021
- Built REST APIs in Node.js.

Education
B.Tech Computer Science — NIT, 2014–2018

Skills
TypeScript, Go, PostgreSQL, Kafka, Kubernetes

Certifications
AWS Certified Solutions Architect`;

describe("mergeSourceIntoTemplate", () => {
  it("fills contact from the source", () => {
    const { template } = mergeSourceIntoTemplate(skeleton(), STRUCTURED_RESUME);
    expect(template.contact.name).toBe("Rohan Mehta");
    expect(template.contact.email).toBe("rohan@example.com");
    expect(template.contact.phone).toBe("+1 555 123 4567");
    expect(template.contact.linkedin).toContain("linkedin.com/in/rohanmehta");
    expect(template.contact.github).toContain("github.com/rohanmehta");
  });

  it("captures the summary", () => {
    const { template } = mergeSourceIntoTemplate(skeleton(), STRUCTURED_RESUME);
    expect(template.sections.summary?.content).toContain("Backend engineer with 6 years");
  });

  it("parses experience entries and seeds bullets with the refine placeholder", () => {
    const { template, seededEntries } = mergeSourceIntoTemplate(skeleton(), STRUCTURED_RESUME);
    const experience = template.sections.experience ?? [];
    expect(experience).toHaveLength(2);
    expect(experience[0]?.title).toBe("Senior Software Engineer");
    expect(experience[0]?.company).toBe("RetailWorks");
    expect(experience[0]?.dates).toContain("2021");
    expect(experience[0]?.bullets?.[0]).toBe("Reduced API latency by 40%.");
    expect(experience[1]?.bullets?.[0]).toBe("Built REST APIs in Node.js.");
    expect(seededEntries).toBe(0);
  });

  it("seeds the placeholder when an entry has no bullets", () => {
    const source = STRUCTURED_RESUME.replace(
      "- Reduced API latency by 40%.\n- Migrated a monolith to Kafka microservices.",
      "",
    );
    const { template, seededEntries } = mergeSourceIntoTemplate(skeleton(), source);
    expect(seededEntries).toBe(1);
    const seeded = (template.sections.experience ?? []).find((e) =>
      e.bullets?.includes(REFINE_PLACEHOLDER),
    );
    expect(seeded?.title).toBe("Senior Software Engineer");
  });

  it("parses education, skills and certifications", () => {
    const { template } = mergeSourceIntoTemplate(skeleton(), STRUCTURED_RESUME);
    expect(template.sections.education?.[0]?.degree).toBe("B.Tech Computer Science");
    expect(template.sections.education?.[0]?.institution).toBe("NIT");
    const items = (template.sections.skills?.categories ?? []).flatMap((c) => c.items ?? []);
    expect(items).toContain("TypeScript");
    expect(items).toContain("Kafka");
    expect(template.sections.certifications).toContain("AWS Certified Solutions Architect");
  });

  it("handles header-less resumes (single-line experience, no section headers)", () => {
    const flat = `Rohan Mehta — Backend Engineer (6 years).
Senior Software Engineer — RetailWorks, 2021–Present.
Built inventory synchronization services.
Skills: TypeScript, Go, PostgreSQL, Redis, Kafka, Docker, Kubernetes, AWS.`;
    const { template, seededEntries } = mergeSourceIntoTemplate(skeleton(), flat);
    expect(seededEntries).toBe(1);
    expect(template.sections.experience?.[0]?.company).toBe("RetailWorks");
    const items = (template.sections.skills?.categories ?? []).flatMap((c) => c.items ?? []);
    expect(items).toContain("Kafka");
  });

  it("preserves template contact fields it did not find in the source", () => {
    const withContact = skeleton();
    withContact.contact = { ...withContact.contact, phone: "keep-me" };
    const { template } = mergeSourceIntoTemplate(withContact, "Alex Doe\nno-contact-details-here");
    expect(template.contact.phone).toBe("keep-me");
  });
});
