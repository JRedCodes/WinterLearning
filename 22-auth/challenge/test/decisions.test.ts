import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SECTIONS = ["Context", "Options considered", "Decision", "Consequences"];
const text = readFileSync(new URL("../DECISIONS.md", import.meta.url), "utf8").replace(/<!--[\s\S]*?-->/g, "");

function section(name: string): string | undefined {
  const match = text.match(new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"));
  return match?.[1]?.trim();
}

describe("TODO(8) · DECISIONS.md (sessions vs JWT)", () => {
  it.each(SECTIONS)("has a filled-in '## %s' section", (name) => {
    const body = section(name);
    expect(body, `missing heading "## ${name}"`).toBeDefined();
    expect(body, `"## ${name}" still contains the TODO placeholder`).not.toMatch(/\bTODO\b/);
    const words = body!.split(/\s+/).filter(Boolean).length;
    expect(words, `"## ${name}" needs at least 30 words, has ${words}`).toBeGreaterThanOrEqual(30);
  });

  it("mentions both sessions and JWT", () => {
    expect(text).toMatch(/session/i);
    expect(text).toMatch(/jwt/i);
  });
});
