import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function sections(path: string): Record<string, string> {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const out: Record<string, string> = {};
  let current: string | undefined;
  for (const line of text.split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) out[(current = h[1]!.toLowerCase())] = "";
    else if (current) out[current] += `${line}\n`;
  }
  return out;
}

describe("DECISIONS.md: SSRF defence for import-from-URL", () => {
  it("fills in Context / Options considered / Decision / Consequences", () => {
    const doc = sections("DECISIONS.md");
    for (const h of ["context", "options considered", "decision", "consequences"]) {
      const body = doc[h];
      expect(body, `missing "## ${h}"`).toBeDefined();
      expect(body!, `"## ${h}" still says TODO`).not.toMatch(/\bTODO\b/);
      expect(body!.split(/\s+/).filter((w) => /\w/.test(w)).length, `"## ${h}" needs at least 20 words`).toBeGreaterThanOrEqual(20);
    }
  });
});
