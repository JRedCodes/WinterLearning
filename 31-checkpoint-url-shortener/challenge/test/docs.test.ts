import { describe, expect, it } from "vitest";
import { findSection, hasCodeBlock, itemCount, normalize, numericTokens, sections, stripComments, wordCount } from "./lib/markdown.js";
import { readProjectFile } from "./helpers/env.js";

/** Same headings as module 30's template; lower minimums because the code is the main deliverable. */
const DESIGN_RULES: { heading: string; minWords: number; check?: (body: string, where: string) => void }[] = [
  { heading: "Requirements", minWords: 60 },
  {
    heading: "Estimates",
    minWords: 40,
    check: (b, w) => expect(numericTokens(b).length, `${w} needs numbers`).toBeGreaterThanOrEqual(4),
  },
  { heading: "API", minWords: 20 },
  { heading: "Data Model", minWords: 40 },
  {
    heading: "High-Level Design",
    minWords: 50,
    check: (b, w) => expect(hasCodeBlock(b, "mermaid"), `${w} needs a \`\`\`mermaid diagram`).toBe(true),
  },
  {
    heading: "Deep Dives",
    minWords: 150,
    check: (b, w) => expect(sections(b, 3).length, `${w} needs at least 2 "###" subsections`).toBeGreaterThanOrEqual(2),
  },
  {
    heading: "Trade-offs",
    minWords: 50,
    check: (b, w) => expect(itemCount(b), `${w} needs at least 3 items`).toBeGreaterThanOrEqual(3),
  },
  {
    heading: "Failure Modes",
    minWords: 50,
    check: (b, w) => expect(itemCount(b), `${w} needs at least 3 items`).toBeGreaterThanOrEqual(3),
  },
];

describe("DESIGN.md (module 30's template, describing what you built)", () => {
  const md = readProjectFile("DESIGN.md");
  const h2 = sections(md, 2);
  for (const rule of DESIGN_RULES) {
    it(`## ${rule.heading}`, () => {
      const s = findSection(h2, rule.heading);
      expect(s, `DESIGN.md is missing "## ${rule.heading}"`).toBeDefined();
      if (!s) return;
      const where = `DESIGN.md › "${s.title}"`;
      const n = wordCount(s.body);
      expect(n, `${where} needs at least ${rule.minWords} words of your own (has ${n})`).toBeGreaterThanOrEqual(rule.minWords);
      rule.check?.(s.body, where);
    });
  }
});

describe("DECISIONS.md", () => {
  const md = stripComments(readProjectFile("DECISIONS.md"));
  const decisions = sections(md, 2).filter((s) => normalize(s.title).startsWith("decision"));

  it("records at least two decisions, each with Context / Options considered / Decision / Consequences", () => {
    expect(decisions.length, 'expected at least two "## Decision ..." sections').toBeGreaterThanOrEqual(2);
    for (const d of decisions) {
      const sub = sections(d.body, 3);
      for (const h of ["Context", "Options considered", "Decision", "Consequences"]) {
        const s = findSection(sub, h);
        expect(s, `"## ${d.title}" is missing "### ${h}"`).toBeDefined();
        const n = wordCount(s?.body ?? "");
        expect(n, `"## ${d.title}" › "### ${h}" needs at least 20 words (has ${n})`).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("justifies the redirect status code (301 vs 302)", () => {
    expect(md).toMatch(/\b301\b/);
    expect(md).toMatch(/\b302\b/);
  });
});
