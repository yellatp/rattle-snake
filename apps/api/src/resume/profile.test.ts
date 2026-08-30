import { describe, expect, it } from "vitest";
import type { UserProfile } from "@rattlesnake/shared";
import type { ResumeTemplate } from "./types.js";
import { applyProfileToTemplate, buildProfileBio } from "./profile.js";

const TEMPLATE: ResumeTemplate = {
  role: "Data Scientist",
  slug: "data_scientist",
  contact: { name: "Alex Doe" },
  sections: {
    summary: { content: "[Summary to be refined]", editable: true },
    skills: {
      categories: [{ name: "Languages", items: ["Python"] }],
    },
    experience: [
      {
        title: "Data Analyst",
        company: "Placeholder Co",
        bullets: ["Analyzed dashboards"],
      },
    ],
    education: [{ degree: "B.Sc", institution: "Placeholder U" }],
    certifications: ["Placeholder Cert"],
  },
  ats_keywords: [],
};

const PROFILE: UserProfile = {
  id: "prof_1",
  name: "Rohan Mehta",
  email: "rohan@example.com",
  isMaster: true,
  hasPin: false,
  personalInfo: {
    firstName: "Rohan",
    lastName: "Mehta",
    email: "rohan@example.com",
    phone: "+1 555 0100",
    location: "New York, USA",
    linkedin: "linkedin.com/in/rohanmehta",
    github: "github.com/rohanmehta",
    headline: "Senior Data Scientist, 7 years in applied ML.",
  },
  totalWorkExperience: "7 years",
  workAuthorization: "US Citizen",
  experience: [
    {
      title: "Senior Data Scientist",
      company: "Analytics Inc",
      dates: "2021-Present",
      bullets: ["Built churn models", "Shipped an ML platform"],
    },
  ],
  skills: [
    { name: "Languages", items: [{ name: "Python", isHighlighted: true }] },
  ],
  certifications: ["AWS Certified ML Specialist"],
};

describe("applyProfileToTemplate", () => {
  it("layers profile contact onto the template", () => {
    const next = applyProfileToTemplate(TEMPLATE, PROFILE);
    expect(next.contact.name).toBe("Rohan Mehta");
    expect(next.contact.email).toBe("rohan@example.com");
    expect(next.contact.phone).toBe("+1 555 0100");
    expect(next.contact.linkedin).toContain("rohanmehta");
    expect(next.contact.github).toContain("rohanmehta");
  });

  it("replaces placeholder summary with the profile headline", () => {
    const next = applyProfileToTemplate(TEMPLATE, PROFILE);
    expect(next.sections.summary?.content).toBe(
      "Senior Data Scientist, 7 years in applied ML.",
    );
  });

  it("replaces experience, skills and certifications from the profile", () => {
    const next = applyProfileToTemplate(TEMPLATE, PROFILE);
    expect(next.sections.experience?.[0]?.company).toBe("Analytics Inc");
    expect(next.sections.experience?.[0]?.title).toBe("Senior Data Scientist");
    const items = (next.sections.skills?.categories ?? []).flatMap((c) => c.items ?? []);
    expect(items).toContain("Python");
    expect(next.sections.certifications).toContain("AWS Certified ML Specialist");
  });

  it("keeps template sections the profile does not fill", () => {
    const sparse: UserProfile = { ...PROFILE, experience: undefined, skills: undefined };
    const next = applyProfileToTemplate(TEMPLATE, sparse);
    expect(next.sections.experience?.[0]?.company).toBe("Placeholder Co");
  });
});

describe("buildProfileBio", () => {
  it("renders a human-readable structured bio", () => {
    const bio = buildProfileBio(PROFILE);
    expect(bio).toContain("Rohan Mehta");
    expect(bio).toContain("Senior Data Scientist, 7 years in applied ML.");
    expect(bio).toContain("Total experience: 7 years");
    expect(bio).toContain("Analytics Inc");
    expect(bio).toContain("Languages: Python");
    expect(bio).toContain("AWS Certified ML Specialist");
  });
});
