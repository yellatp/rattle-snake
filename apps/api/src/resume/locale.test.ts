import { describe, expect, it } from "vitest";
import {
  buildEnglishVariantDirective,
  detectEnglishLocale,
  LOCALE_COUNTRY,
  LOCALE_TITLE,
} from "./locale.js";

describe("detectEnglishLocale", () => {
  it("defaults to US English when nothing indicates a country", () => {
    expect(detectEnglishLocale(undefined, "A generic job description.")).toBe("us");
    expect(detectEnglishLocale("", "Remote across Europe")).toBe("us");
  });

  it("uses UK English when the explicit location is in the UK", () => {
    expect(detectEnglishLocale("London, UK", "any")).toBe("uk");
    expect(detectEnglishLocale("Manchester", "any")).toBe("uk");
    expect(detectEnglishLocale("Scotland", "any")).toBe("uk");
  });

  it("uses US English when the explicit location is in the US", () => {
    expect(detectEnglishLocale("New York, USA", "any")).toBe("us");
    expect(detectEnglishLocale("San Francisco, CA", "any")).toBe("us");
    expect(detectEnglishLocale("Remote - US", "any")).toBe("us");
  });

  it("detects UK markers inside the job description", () => {
    const jd =
      "The role is based at our London office. We offer a competitive salary in GBP.";
    expect(detectEnglishLocale(undefined, jd)).toBe("uk");
  });

  it("detects US markers inside the job description", () => {
    const jd =
      "Our engineering hub is in San Francisco. Compensation in USD with 401(k).";
    expect(detectEnglishLocale(undefined, jd)).toBe("us");
  });

  it("prefers the explicit location field over JD markers", () => {
    const jd = "Based in New York, USA.";
    expect(detectEnglishLocale("Edinburgh, UK", jd)).toBe("uk");
    expect(detectEnglishLocale("Austin, Texas", jd)).toBe("us");
  });
});

describe("buildEnglishVariantDirective", () => {
  it("produces a US English directive with US spellings and terminology", () => {
    const directive = buildEnglishVariantDirective("us");
    expect(directive).toContain("US English");
    expect(directive).toContain(LOCALE_TITLE.us);
    expect(directive).toContain("organize, analyze, specialize");
    expect(directive).toContain("color, behavior, center");
    expect(directive).toContain("resume");
    expect(directive).not.toContain("colour");
  });

  it("produces a UK English directive with UK spellings and terminology", () => {
    const directive = buildEnglishVariantDirective("uk");
    expect(directive).toContain("UK English");
    expect(directive).toContain(LOCALE_TITLE.uk);
    expect(directive).toContain(LOCALE_COUNTRY.uk);
    expect(directive).toContain("organise, analyse, specialise");
    expect(directive).toContain("colour, behaviour, centre");
    expect(directive).toContain("CV");
    expect(directive).toContain("GBP");
    expect(directive).not.toContain("organize");
  });

  it("demands one consistent variant across the whole resume", () => {
    const directive = buildEnglishVariantDirective("uk");
    expect(directive).toContain("Apply the variant consistently");
    expect(directive).toContain("Do NOT mix spellings");
  });
});
