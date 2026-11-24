import { describe, expect, it } from "vitest";
import { readProjectFile } from "./helpers/env.js";

const REQUIRED = ["Context", "Options considered", "Decision", "Consequences"];
const words = (s: string) => s.split(/\s+/).filter((w) => /\w/.test(w)).length;

/** Splits DECISIONS.md into "### Heading" sections, HTML comments removed. */
function sections() {
  const text = readProjectFile("DECISIONS.md").replace(/<!--[\s\S]*?-->/g, "");
  const out: { heading: string; body: string }[] = [];
  for (const part of text.split(/^###\s+/m).slice(1)) {
    const [heading = "", ...rest] = part.split("\n");
    out.push({ heading: heading.trim(), body: rest.join("\n").split(/^##\s/m)[0]!.trim() });
  }
  return out;
}

describe("DECISIONS.md", () => {
  it("has Context / Options considered / Decision / Consequences sections", () => {
    const headings = sections().map((s) => s.heading.toLowerCase());
    for (const h of REQUIRED) expect(headings, `missing "### ${h}"`).toContain(h.toLowerCase());
  });

  it("every section has real content (at least 20 words, not just the template comments)", () => {
    const all = sections();
    expect(all.length).toBeGreaterThanOrEqual(8);
    for (const s of all) expect(words(s.body), `"### ${s.heading}" needs your own words`).toBeGreaterThanOrEqual(20);
  });

  it("covers the session and rate-limiting decisions", () => {
    const text = readProjectFile("DECISIONS.md").replace(/<!--[\s\S]*?-->/g, "").toLowerCase();
    expect(text).toMatch(/session/);
    expect(text).toMatch(/rate.?limit/);
    expect(text).toMatch(/jwt|token/);
  });
});
