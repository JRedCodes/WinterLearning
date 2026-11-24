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

describe("DECISIONS.md: how outbox events get to Kafka", () => {
  const doc = sections("DECISIONS.md");

  it.each(["context", "options considered", "decision", "consequences"])("fills in \"## %s\"", (heading) => {
    const body = doc[heading];
    expect(body, `missing section "## ${heading}"`).toBeDefined();
    expect(body!, `"## ${heading}" still contains TODO`).not.toMatch(/\bTODO\b/);
    expect(words(body!), `"## ${heading}" needs at least 25 words`).toBeGreaterThanOrEqual(25);
  });

  it("compares a polling relay with change data capture", () => {
    const options = doc["options considered"] ?? "";
    expect(options, "discuss the polling publisher").toMatch(/poll/i);
    expect(options, "discuss CDC (e.g. Debezium reading the WAL)").toMatch(/CDC|Debezium|change data capture|WAL/i);
  });
});
