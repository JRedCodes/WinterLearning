/** TODO 10: DECISIONS.md */
import { describe, expect, it } from "vitest";
import { readText } from "./helpers/manifests.js";

const text = readText("DECISIONS.md").replace(/<!--[\s\S]*?-->/g, "");
const section = (h: string) => {
  const m = new RegExp(`^## ${h}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(text);
  return m?.[1]?.trim() ?? "";
};

describe("DECISIONS.md (TODO 10)", () => {
  it.each(["Context", "Options considered", "Decision", "Consequences"])("section %s has real content (>= 20 words)", (h) => {
    const words = section(h).split(/\s+/).filter(Boolean).length;
    expect(words, `## ${h} has ${words} words`).toBeGreaterThanOrEqual(20);
  });
});
