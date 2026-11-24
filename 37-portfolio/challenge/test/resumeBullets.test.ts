import { describe, expect, it } from "vitest";
import { bullets, sections } from "./lib/markdown.js";
import { expectNoLeftovers, expectSection, loadDoc } from "./lib/expectations.js";

const FILE = "RESUME_BULLETS.md";
const WEAK_OPENERS = /^(responsible for|worked on|helped|assisted|was involved|participated|tasked with|duties included)\b/i;

describe(FILE, () => {
  const md = loadDoc(FILE);
  const h2 = sections(md, 2);

  it("has a short headline/summary", () => {
    expectSection(FILE, h2, "Headline", { minWords: 15 });
  });

  it("has at least 4 capstone bullets and 6 bullets from other modules", () => {
    expectSection(FILE, h2, "Capstone", { minBullets: 4 });
    expectSection(FILE, h2, "Projects", { minBullets: 6 });
  });

  it("has a skills section", () => {
    expectSection(FILE, h2, "Skills", { minBullets: 3 });
  });

  describe("bullet quality (Capstone + Projects)", () => {
    const pick = (name: string) => h2.find((s) => s.title.toLowerCase().startsWith(name))?.body ?? "";
    const items = [...bullets(pick("capstone")), ...bullets(pick("projects"))].map((b) => b.replace(/\*\*/g, ""));

    it("each bullet is one tight line: 8 to 45 words", () => {
      const bad = items.filter((b) => {
        const n = b.split(/\s+/).length;
        return n < 8 || n > 45;
      });
      expect(bad, `These bullets are too short (<8 words) or too long (>45 words):\n  ${bad.join("\n  ")}`).toEqual([]);
    });

    it("no bullet starts with a weak opener (Responsible for, Worked on, Helped...)", () => {
      const bad = items.filter((b) => WEAK_OPENERS.test(b));
      expect(bad, `Start with a strong action verb instead:\n  ${bad.join("\n  ")}`).toEqual([]);
    });

    it("at least half the bullets contain a number (scale, count, latency, %)", () => {
      const withNumbers = items.filter((b) => /\d/.test(b)).length;
      expect(items.length).toBeGreaterThan(0);
      expect(
        withNumbers,
        `Only ${withNumbers}/${items.length} bullets have a number. Quantify honestly: tests, requests/s, p95, rows, concurrent users.`,
      ).toBeGreaterThanOrEqual(Math.ceil(items.length / 2));
    });

    it("bullets are unique", () => {
      expect(new Set(items).size, "Some bullets are duplicated").toBe(items.length);
    });
  });

  it("has no leftover template placeholders", () => {
    expectNoLeftovers(FILE, md);
  });
});
