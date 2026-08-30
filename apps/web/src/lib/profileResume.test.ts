import { describe, expect, it } from "vitest";
import type { UserProfile } from "@rattlesnake/shared";
import { profileToResumeMarkdown } from "./profileResume";

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "prof_1",
    name: "Pavan Yellathakota",
    email: "pavan@example.com",
    isMaster: true,
    hasPin: false,
    updatedAt: "2026-08-15T18:58:17.000Z",
    ...overrides,
  };
}

describe("profileToResumeMarkdown", () => {
  it("renders name, headline, contact and CTA in the header block", () => {
    const md = profileToResumeMarkdown(
      profile({
        personalInfo: {
          firstName: "Pavan",
          lastName: "Yellathakota",
          headline: "Machine Learning Engineer | Production ML & Generative AI Systems",
          phone: "+1 555 0100",
          location: "New York, USA",
          linkedin: "linkedin.com/in/pavan",
        },
        workAuthorization: "F1 OPT",
        totalWorkExperience: "4+ years",
      }),
    );

    expect(md).toContain("Pavan Yellathakota");
    expect(md).toContain("Machine Learning Engineer | Production ML");
    expect(md).toContain("pavan@example.com | +1 555 0100 | New York, USA | linkedin.com/in/pavan");
    expect(md).toContain("F1 OPT | 4+ years");
  });

  it("renders experience bullets under a Work Experience heading", () => {
    const md = profileToResumeMarkdown(
      profile({
        experience: [
          {
            title: "Machine Learning Engineer",
            company: "RetailWorks",
            dates: "2022-Present",
            bullets: ["Built production ML pipelines", "Fine-tuned LLMs"],
          },
        ],
      }),
    );

    expect(md).toContain("## Work Experience");
    expect(md).toContain("### Machine Learning Engineer, RetailWorks | 2022-Present");
    expect(md).toContain("- Built production ML pipelines");
    expect(md).toContain("- Fine-tuned LLMs");
  });

  it("renders skills, projects, education and certifications", () => {
    const md = profileToResumeMarkdown(
      profile({
        skills: [{ name: "Languages", items: [{ name: "Python" }, { name: "TypeScript" }] }],
        projects: [{ name: "Rattle-Snake", description: "Committee AI.", link: "github.com/x" }],
        education: [{ degree: "MS", institution: "NYU", location: "New York", dates: "2024" }],
        certifications: ["AWS Certified"],
        languages: ["English"],
      }),
    );

    expect(md).toContain("Languages: Python, TypeScript");
    expect(md).toContain("### Rattle-Snake | github.com/x");
    expect(md).toContain("- MS | NYU | New York | 2024");
    expect(md).toContain("## Certifications");
    expect(md).toContain("## Languages");
  });

  it("returns an empty string for a profile with no resume content", () => {
    expect(profileToResumeMarkdown(profile({ name: "", email: "" }))).toBe("");
  });
});
