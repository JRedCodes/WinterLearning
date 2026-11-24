import { expect } from "vitest";
import { bullets, checkboxes, findSection, hasCodeBlock, leftovers, readDoc, type Section, wordCount } from "./markdown.js";

/** Load a deliverable or fail with a message that says what to do. */
export function loadDoc(file: string): string {
  const md = readDoc(file);
  expect(md, `${file} is missing. It should be in challenge/ (start from the template).`).not.toBeNull();
  return md ?? "";
}

export interface SectionRules {
  minWords?: number;
  minBullets?: number;
  minCheckboxes?: number;
  needsCode?: boolean;
  needsMermaid?: boolean;
}

/** Assert a section exists and meets the rules. Returns it for further checks. */
export function expectSection(file: string, all: Section[], heading: string, rules: SectionRules = {}): Section {
  const section = findSection(all, heading);
  const titles = all.map((s) => `"${s.title}"`).join(", ") || "none";
  expect(section, `${file}: missing section "${heading}". Found: ${titles}`).toBeDefined();
  if (!section) throw new Error("unreachable");
  const where = `${file} › "${section.title}"`;

  if (rules.minWords !== undefined) {
    const n = wordCount(section.body);
    expect(n, `${where} needs at least ${rules.minWords} words of your own (has ${n}). Template comments don't count.`).toBeGreaterThanOrEqual(rules.minWords);
  }
  if (rules.minBullets !== undefined) {
    const n = bullets(section.body).length;
    expect(n, `${where} needs at least ${rules.minBullets} bullet points (has ${n}).`).toBeGreaterThanOrEqual(rules.minBullets);
  }
  if (rules.minCheckboxes !== undefined) {
    const n = checkboxes(section.body).length;
    expect(n, `${where} needs at least ${rules.minCheckboxes} checklist items like "- [ ] ..." (has ${n}).`).toBeGreaterThanOrEqual(rules.minCheckboxes);
  }
  if (rules.needsCode) {
    expect(hasCodeBlock(section.body), `${where} needs a fenced code block with the commands to run.`).toBe(true);
  }
  if (rules.needsMermaid) {
    expect(hasCodeBlock(section.body, "mermaid"), `${where} needs a \`\`\`mermaid diagram.`).toBe(true);
  }
  return section;
}

export function expectNoLeftovers(file: string, md: string): void {
  const left = leftovers(md);
  expect(left, `${file} still has template placeholders (TODO or <Like This>):\n  ${left.join("\n  ")}`).toEqual([]);
}
