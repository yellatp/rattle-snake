import { describe, expect, it } from "vitest";
import { resumeToMarkdown } from "./serialize.js";
import type { ResumeTemplate } from "./types.js";

const TEMPLATE: ResumeTemplate = {
  role: "Software Engineer",
  slug: "swe",
  contact: {
    name: "Rohan Mehta",
    location: "Bengaluru, India",
    email: "rohan@example.com",
    phone: "",
    linkedin: "",
    github: "",
    portfolio: "",
  },
  sections: {
    summary: { content: "Backend engineer with 6 years of experience." },
    skills: {
      categories: [
        { name: "Languages", items: ["TypeScript", "Go"] },
        { name: "Infra", items: ["Kubernetes", "AWS"] },
      ],
    },
    experience: [
      {
        id: "e1",
        title: "Senior Software Engineer",
        company: "RetailWorks",
        dates: "2021 – Present",
        bullets: ["Reduced API latency by 40%.", "Migrated to Kafka."],
      },
      { id: "e2", title: "Software Engineer", company: "TravelBuddy", dates: "2019 – 2021", bullets: [] },
    ],
    education: [{ degree: "B.Tech Computer Science", institution: "NIT", dates: "2014 – 2018" }],
    certifications: ["AWS Certified Solutions Architect"],
    coreCompetencies: ["Distributed Systems", "System Design"],
  },
  ats_keywords: [],
};

describe("resumeToMarkdown", () => {
  it("renders the standard resume markdown shape", () => {
    const md = resumeToMarkdown(TEMPLATE);
    expect(md.startsWith("# Rohan Mehta")).toBe(true);
    expect(md).toContain("Bengaluru, India");
    expect(md).toContain("## Summary");
    expect(md).toContain("Backend engineer with 6 years of experience.");
    expect(md).toContain("## Core Competencies");
    expect(md).toContain("Distributed Systems, System Design");
    expect(md).toContain("## Skills");
    expect(md).toContain("**Languages:** TypeScript, Go");
    expect(md).toContain("## Experience");
    expect(md).toContain("### Senior Software Engineer | RetailWorks | 2021 – Present");
    expect(md).toContain("- Reduced API latency by 40%.");
    expect(md).toContain("### Software Engineer | TravelBuddy | 2019 – 2021");
    expect(md).toContain("## Education");
    expect(md).toContain("- B.Tech Computer Science | NIT | 2014 – 2018");
    expect(md).toContain("## Certifications");
    expect(md).toContain("- AWS Certified Solutions Architect");
  });

  it("never emits em-dashes or middle dots in the rendered markdown", () => {
    const md = resumeToMarkdown(TEMPLATE);
    expect(md.includes("\u2014")).toBe(false);
    expect(md.includes("\u00b7")).toBe(false);
  });

  it("omits the name heading when the contact has no name", () => {
    const md = resumeToMarkdown({ ...TEMPLATE, contact: { ...TEMPLATE.contact, name: "" } });
    expect(md.startsWith("# ")).toBe(false);
  });

  it("produces a non-empty single-page-sized document from an empty skeleton", () => {
    const empty: ResumeTemplate = {
      role: "Software Engineer",
      slug: "swe",
      contact: {},
      sections: {},
      ats_keywords: [],
    };
    expect(resumeToMarkdown(empty)).toBe("");
  });

  it("renders without crashing when sections carry objects instead of strings", () => {
    const malformed: ResumeTemplate = {
      ...TEMPLATE,
      sections: {
        ...TEMPLATE.sections,
        certifications: [
          { name: "AWS Certified Solutions Architect" } as unknown as string,
          "PMP",
          null as unknown as string,
        ],
        coreCompetencies: [
          { name: "Distributed Systems" } as unknown as string,
          5 as unknown as string,
        ],
        skills: {
          categories: [
            { name: "Languages", items: ["TypeScript", { name: "Go" } as unknown as string] },
          ],
        },
        experience: [
          {
            id: "e1",
            title: { name: "Staff Engineer" } as unknown as string,
            company: "Co",
            bullets: [{ name: "Built the platform." } as unknown as string],
          },
        ],
      },
    };
    expect(() => resumeToMarkdown(malformed)).not.toThrow();
    const md = resumeToMarkdown(malformed);
    expect(md).toContain("- AWS Certified Solutions Architect");
    expect(md).toContain("- PMP");
    expect(md).toContain("Distributed Systems");
    expect(md).toContain("**Languages:** TypeScript, Go");
    expect(md).toContain("### Staff Engineer | Co");
    expect(md).toContain("- Built the platform.");
  });
});
