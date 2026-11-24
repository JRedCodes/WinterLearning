import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").replace(/<!--[\s\S]*?-->/g, "");

function sections(text: string, level: "##" | "###"): Map<string, string> {
  const map = new Map<string, string>();
  const re = new RegExp(`^${level} (.+)$`, "gm");
  const heads = [...text.matchAll(re)];
  heads.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < heads.length ? heads[i + 1]!.index! : text.length;
    map.set(m[1]!.trim(), text.slice(start, end));
  });
  return map;
}

const words = (s: string) => s.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;

describe("M8 · DESIGN.md", () => {
  const text = read("DESIGN.md");
  const parts = sections(text, "##");
  const REQUIRED = [
    "Requirements",
    "Estimates",
    "API",
    "Data Model",
    "High-Level Design",
    "Deep Dives",
    "Trade-offs",
    "Failure Modes",
  ];

  it.each(REQUIRED)("has a filled-in '## %s' section (60+ words, no TODO)", (name) => {
    const body = parts.get(name);
    expect(body, `missing heading "## ${name}"`).toBeDefined();
    expect(body, `"## ${name}" still contains TODO`).not.toMatch(/\bTODO\b/);
    expect(words(body!), `"## ${name}" needs at least 60 words`).toBeGreaterThanOrEqual(60);
  });

  it("includes at least one mermaid diagram in High-Level Design", () => {
    expect(parts.get("High-Level Design") ?? "").toMatch(/```mermaid/);
  });
});

describe("M8 · DECISIONS.md", () => {
  const text = read("DECISIONS.md");
  const adrs = [...sections(text, "##").entries()].filter(([title]) => /^ADR-\d+/.test(title));

  it("records at least three decisions as '## ADR-NNN: title'", () => {
    expect(adrs.length).toBeGreaterThanOrEqual(3);
  });

  it("every ADR has Context / Options considered / Decision / Consequences (20+ words each, no TODO)", () => {
    for (const [title, body] of adrs) {
      const sub = sections(body, "###");
      for (const name of ["Context", "Options considered", "Decision", "Consequences"]) {
        const s = sub.get(name);
        expect(s, `${title}: missing "### ${name}"`).toBeDefined();
        expect(s, `${title}: "### ${name}" still contains TODO`).not.toMatch(/\bTODO\b/);
        expect(words(s!), `${title}: "### ${name}" needs 20+ words`).toBeGreaterThanOrEqual(20);
      }
    }
  });
});
