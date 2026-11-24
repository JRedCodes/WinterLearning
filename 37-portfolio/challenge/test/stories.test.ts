import { describe, expect, it } from "vitest";
import { sections } from "./lib/markdown.js";
import { expectNoLeftovers, expectSection, loadDoc } from "./lib/expectations.js";

const FILE = "STORIES.md";

describe(FILE, () => {
  const md = loadDoc(FILE);
  const h2 = sections(md, 2);
  const stories = h2.filter((s) => /^story\b/i.test(s.title));

  it("has a 60-second project pitch", () => {
    expectSection(FILE, h2, "Project pitch", { minWords: 50 });
  });

  it("has at least 3 stories with descriptive titles (## Story 1: ...)", () => {
    expect(stories.length, `${FILE} needs at least 3 "## Story N: <title>" sections (found ${stories.length})`).toBeGreaterThanOrEqual(3);
    for (const s of stories) {
      expect(s.title.replace(/^story\s*\d*\s*[:.\-]?\s*/i, "").length, `"${s.title}" needs a descriptive title after "Story N:"`).toBeGreaterThan(5);
    }
  });

  it("every story follows STAR plus a reflection, with real substance", () => {
    expect(stories.length).toBeGreaterThanOrEqual(3);
    for (const story of stories) {
      const h3 = sections(story.body, 3);
      const label = `${FILE} › "${story.title}"`;
      expectSection(label, h3, "Situation", { minWords: 25 });
      expectSection(label, h3, "Task", { minWords: 15 });
      expectSection(label, h3, "Action", { minWords: 60 });
      expectSection(label, h3, "Result", { minWords: 25 });
      expectSection(label, h3, "Reflection", { minWords: 20 });
    }
  });

  it("has no leftover template placeholders", () => {
    expectNoLeftovers(FILE, md);
  });
});
