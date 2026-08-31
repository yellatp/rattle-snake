#!/usr/bin/env node
/**
 * UI copy gate (design plan R5, section 14.7): fails when banned content
 * appears in web source - emojis, em/en dashes, smart quotes, marketing
 * filler, and version strings in the product UI.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const BANNED_PHRASES = [
  /seamless/i,
  /supercharge/i,
  /\brobust\b/i,
  /\bunlock(ing)?\b/i,
  /\bpowerful\b/i,
  /\belevate\b/i,
  /rattle-snake v2/i,
];

const BANNED_CHARS = [
  { name: "emoji", pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u },
  { name: "em/en dash", pattern: /[\u2013\u2014]/ },
  { name: "smart quote", pattern: /[\u201C\u201D\u2018\u2019]/ },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts|astro|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(ROOT)) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const { name, pattern } of BANNED_CHARS) {
      if (pattern.test(line)) {
        violations.push(`${file}:${index + 1}: ${name}`);
      }
    }
    for (const pattern of BANNED_PHRASES) {
      if (pattern.test(line)) {
        violations.push(`${file}:${index + 1}: banned phrase ${pattern}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error("UI copy violations found:");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log("UI copy check passed.");
