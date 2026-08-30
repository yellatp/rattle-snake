import { describe, expect, it } from "vitest";
import {
  containsEmDash,
  containsUnprofessionalEmoji,
  sanitizeText,
  sanitizeTypography,
  stripEmoji,
} from "./sanitize.js";

describe("sanitizeTypography", () => {
  it("replaces em-dashes with ', ' (V1 convention)", () => {
    expect(sanitizeTypography("led the team — delivering a 40% gain")).toBe(
      "led the team ,  delivering a 40% gain",
    );
  });

  it("replaces en-dashes with '-'", () => {
    expect(sanitizeTypography("2020 – 2023")).toBe("2020 - 2023");
  });

  it("normalizes smart quotes and ellipses", () => {
    expect(
      sanitizeTypography("\u201csmart\u201d and \u2018single\u2019 \u2026 done"),
    ).toBe('"smart" and \'single\' ... done');
  });

  it("is a no-op on clean ASCII text", () => {
    expect(sanitizeTypography("plain resume text, 2024 - Present")).toBe(
      "plain resume text, 2024 - Present",
    );
  });
});

describe("containsEmDash", () => {
  it("detects em-dashes and en-dashes", () => {
    expect(containsEmDash("foo \u2014 bar")).toBe(true);
    expect(containsEmDash("foo \u2013 bar")).toBe(true);
  });

  it("passes clean text", () => {
    expect(containsEmDash("foo - bar")).toBe(false);
  });
});

describe("stripEmoji / containsUnprofessionalEmoji", () => {
  it("strips emojis", () => {
    expect(stripEmoji("Great skill! \u{1F680} impressed \u2705")).toBe(
      "Great skill!  impressed ",
    );
  });

  it("detects emojis", () => {
    expect(containsUnprofessionalEmoji("highly capable \u{1F31F}")).toBe(true);
    expect(containsUnprofessionalEmoji("plain text only")).toBe(false);
  });

  it("removes ZWJ sequences and skin-tone modifiers via sanitizeText", () => {
    const handshake = "\u{1F91D}\u200D\u{1F91D}";
    const withTone = "wave \u{1F44B}\u{1F3FB}";
    expect(stripEmoji(handshake)).toBe("\u200D");
    expect(sanitizeText(handshake)).toBe("");
    expect(sanitizeText(withTone)).toBe("wave ");
  });
});

describe("sanitizeText", () => {
  it("applies the full hygiene pass", () => {
    const dirty = "Led the team \u2014 great \u{1F680} results";
    const clean = sanitizeText(dirty);
    expect(containsEmDash(clean)).toBe(false);
    expect(containsUnprofessionalEmoji(clean)).toBe(false);
  });
});
