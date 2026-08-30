import { describe, expect, it } from "vitest";
import { normalizeResumeJson, filterSections, contactParts } from "./normalize";
import { toPlaintext } from "./to-plaintext";
import { toMarkdown } from "./to-markdown";
import { downloadFilename } from "./paths";
import { toDocx } from "./to-docx";
import { toPdf } from "./to-pdf";
import { DEFAULT_EXPORT_OPTIONS } from "./types";

const RESUME_JSON = JSON.stringify({
  role: "swe",
  contact: {
    name: "Rohan Mehta",
    email: "rohan@example.com",
    phone: "+1 555 0100",
    location: "New York, USA",
    linkedin: "linkedin.com/in/rohanmehta",
    github: "github.com/rohanmehta",
  },
  sections: {
    summary: { content: "Backend engineer with 6 years of experience." },
    skills: { categories: [{ name: "Languages", items: ["TypeScript", "Go"] }] },
    experience: [
      {
        title: "Senior Software Engineer",
        company: "RetailWorks",
        dates: "2021-Present",
        bullets: ["Built inventory sync services", "Reduced API latency"],
      },
    ],
    education: [{ degree: "B.Tech", institution: "NIT" }],
    certifications: ["AWS Certified Solutions Architect"],
    coreCompetencies: ["Distributed Systems", "Event-Driven Architecture"],
  },
});

describe("normalizeResumeJson", () => {
  it("parses a valid resume into contact + ordered sections", () => {
    const resume = normalizeResumeJson(RESUME_JSON);
    expect(resume).not.toBeNull();
    expect(resume!.contact.name).toBe("Rohan Mehta");
    expect(resume!.role).toBe("swe");
    const keys = resume!.sections.map((s) => s.key);
    expect(keys).toEqual(["summary", "skills", "experience", "education", "certifications", "coreCompetencies"]);
  });

  it("returns null for malformed JSON", () => {
    expect(normalizeResumeJson("{nope")).toBeNull();
    expect(normalizeResumeJson("[]")).toBeNull();
  });

  it("tolerates unknown shapes without throwing", () => {
    const resume = normalizeResumeJson(JSON.stringify({ contact: { name: "X" } }));
    expect(resume).not.toBeNull();
    expect(resume!.sections).toEqual([]);
  });

  it("filterSections drops excluded sections", () => {
    const resume = normalizeResumeJson(RESUME_JSON)!;
    const filtered = filterSections(resume, { excludedSections: ["skills", "education"] });
    expect(filtered.sections.map((s) => s.key)).not.toContain("skills");
    expect(filtered.sections.map((s) => s.key)).not.toContain("education");
    expect(filtered.sections.length).toBe(4);
  });

  it("contactParts skips empty fields", () => {
    const resume = normalizeResumeJson(RESUME_JSON)!;
    const parts = contactParts(resume.contact);
    expect(parts).toContain("rohan@example.com");
    expect(parts).toContain("+1 555 0100");
  });
});

describe("toPlaintext", () => {
  it("renders name, contact, headings and bullets", () => {
    const resume = normalizeResumeJson(RESUME_JSON)!;
    const text = toPlaintext(resume, DEFAULT_EXPORT_OPTIONS);
    expect(text).toContain("ROHAN MEHTA");
    expect(text).toContain("rohan@example.com");
    expect(text).toContain("SUMMARY");
    expect(text).toContain("Backend engineer with 6 years of experience.");
    expect(text).toContain("EXPERIENCE");
    expect(text).toContain("Senior Software Engineer - RetailWorks - 2021-Present");
    expect(text).toContain("  - Built inventory sync services");
  });
});

describe("toMarkdown", () => {
  it("renders name, contact line, section headings and bullets", () => {
    const resume = normalizeResumeJson(RESUME_JSON)!;
    const md = toMarkdown(resume, DEFAULT_EXPORT_OPTIONS);
    expect(md).toContain("# Rohan Mehta");
    expect(md).toContain("rohan@example.com");
    expect(md).toContain("## Summary");
    expect(md).toContain("Backend engineer with 6 years of experience.");
    expect(md).toContain("**Languages:** TypeScript, Go");
    expect(md).toContain("## Experience");
    expect(md).toContain("### Senior Software Engineer, RetailWorks");
    expect(md).toContain("- Built inventory sync services");
    expect(md).toContain("## Certifications");
  });

  it("applies excludedSections", () => {
    const resume = normalizeResumeJson(RESUME_JSON)!;
    const md = toMarkdown(resume, { excludedSections: ["education"] });
    expect(md).not.toContain("## Education");
  });
});

describe("downloadFilename", () => {
  it("builds a Fullname_Role_Resume stem", () => {
    const resume = normalizeResumeJson(RESUME_JSON)!;
    const name = downloadFilename(resume, DEFAULT_EXPORT_OPTIONS, "pdf", "Backend Engineer");
    expect(name).toBe("Rohan_Mehta_Backend_Engineer_Resume.pdf");
  });

  it("falls back to the resume role when no role label is given", () => {
    const resume = normalizeResumeJson(RESUME_JSON)!;
    const name = downloadFilename(resume, DEFAULT_EXPORT_OPTIONS, "pdf");
    expect(name).toBe("Rohan_Mehta_swe_Resume.pdf");
  });

  it("falls back to 'resume' when no name is present", () => {
    const resume = normalizeResumeJson(JSON.stringify({ contact: {}, sections: {} }))!;
    const name = downloadFilename(resume, { ...DEFAULT_EXPORT_OPTIONS, page: "a4" }, "txt");
    expect(name).toBe("resume_Resume.txt");
  });
});

describe("toDocx", () => {
  it("produces a docx Blob", async () => {
    const resume = normalizeResumeJson(RESUME_JSON)!;
    const blob = await toDocx(resume, DEFAULT_EXPORT_OPTIONS);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });
});

describe("toPdf", () => {
  it("produces a multi-page capable PDF document", () => {
    const resume = normalizeResumeJson(RESUME_JSON)!;
    const doc = toPdf(resume, DEFAULT_EXPORT_OPTIONS);
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
  });
});
