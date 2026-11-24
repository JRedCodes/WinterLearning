import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Splits a markdown doc into { "heading": "body" } by level-2 headings, with HTML comments removed. */
function sections(path: string): Record<string, string> {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const out: Record<string, string> = {};
  let current: string | undefined;
  for (const line of text.split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = h[1]!.toLowerCase();
      out[current] = "";
    } else if (current) {
      out[current] += `${line}\n`;
    }
  }
  return out;
}

const words = (s: string) => s.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;

function expectFilled(doc: Record<string, string>, heading: string, minWords: number) {
  const body = doc[heading];
  expect(body, `missing section "## ${heading}"`).toBeDefined();
  expect(body!, `"## ${heading}" still contains TODO`).not.toMatch(/\bTODO\b/);
  expect(words(body!), `"## ${heading}" needs at least ${minWords} words`).toBeGreaterThanOrEqual(minWords);
}

// The answers are stored as hashes so reading this file doesn't give away the investigation.
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ROOT_CAUSE_COMPONENT = "07a5e1f25133b541e942f9532b49768e9c69f4cd29337afd147367eaafa2392e";
const ROOT_CAUSE_CHANGE = "f82c8e606ebd09a45625de81f3b4aa58326f59c63a655ce4e2eab8dc7f48b566";

/** Every token and every pair of adjacent tokens joined by "-", hashed, so "foo bar", "foo-bar" and "`foo-bar`" all match. */
function hashedTerms(text: string): Set<string> {
  const tokens = (text.toLowerCase().match(/[a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9]/g) ?? []).map((t) => t.replace(/^v(?=\d)/, ""));
  const terms = new Set(tokens);
  for (let i = 0; i + 1 < tokens.length; i++) terms.add(`${tokens[i]}-${tokens[i + 1]}`);
  return new Set([...terms].map(sha));
}

describe("part B: incident/POSTMORTEM.md", () => {
  const doc = sections("incident/POSTMORTEM.md");

  it("fills in every section", () => {
    for (const h of ["summary", "impact", "timeline", "detection", "resolution", "lessons learned"]) expectFilled(doc, h, 20);
    expectFilled(doc, "root cause", 40);
  });

  it("has a timeline with at least 6 timestamped entries", () => {
    const entries = (doc.timeline ?? "").split("\n").filter((l) => /^\s*[-*]\s*\**\s*\d{1,2}:\d{2}/.test(l));
    expect(entries.length).toBeGreaterThanOrEqual(6);
  });

  it("names the component at fault in the root cause section", () => {
    expect(
      hashedTerms(doc["root cause"] ?? "").has(ROOT_CAUSE_COMPONENT),
      "The root cause section doesn't name the dependency that caused the outage (as it appears in the logs).",
    ).toBe(true);
  });

  it("names the change that triggered it in the root cause section", () => {
    expect(
      hashedTerms(doc["root cause"] ?? "").has(ROOT_CAUSE_CHANGE),
      "The root cause section doesn't name the release that introduced the problem (as it appears in the logs).",
    ).toBe(true);
  });

  it("explains the mechanism: what was missing that let a slow dependency take checkout down", () => {
    expect(doc["root cause"] ?? "").toMatch(/time ?out/i);
  });

  it("lists at least 3 action items", () => {
    const items = (doc["action items"] ?? "").split("\n").filter((l) => /^\s*([-*]|\d+\.)\s+\S/.test(l));
    expect(items.length).toBeGreaterThanOrEqual(3);
  });
});

describe("DECISIONS.md: checkout SLO and alerting", () => {
  const doc = sections("DECISIONS.md");
  it("fills in Context / Options considered / Decision / Consequences", () => {
    for (const h of ["context", "options considered", "decision", "consequences"]) expectFilled(doc, h, 20);
  });
  it("states a numeric SLO target", () => {
    expect(doc.decision ?? "").toMatch(/\d+(\.\d+)?\s*%/);
  });
});
