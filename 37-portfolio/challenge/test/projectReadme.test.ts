import { describe, expect, it } from "vitest";
import { bullets, sections } from "./lib/markdown.js";
import { expectNoLeftovers, expectSection, loadDoc } from "./lib/expectations.js";

const FILE = "PROJECT_README.md";

describe(FILE, () => {
  const md = loadDoc(FILE);
  const h1 = sections(md, 1);
  const h2 = sections(md, 2);

  it("starts with a real project title (H1)", () => {
    expect(h1.length, `${FILE} needs exactly one "# Title" heading (found ${h1.length})`).toBe(1);
    const title = h1[0]?.title ?? "";
    expect(title.length, "The H1 title is empty").toBeGreaterThan(2);
  });

  it("has an Overview that says what it is and who it's for", () => {
    expectSection(FILE, h2, "Overview", { minWords: 40 });
  });

  it("has a Demo section (link, screenshots or GIF, plus a demo account if any)", () => {
    expectSection(FILE, h2, "Demo", { minWords: 10 });
  });

  it("lists at least 5 features", () => {
    expectSection(FILE, h2, "Features", { minBullets: 5 });
  });

  it("has an Architecture section with a mermaid diagram and an explanation", () => {
    expectSection(FILE, h2, "Architecture", { minWords: 40, needsMermaid: true });
  });

  it("has a Tech stack section", () => {
    expectSection(FILE, h2, "Tech stack", { minBullets: 4 });
  });

  it("has Getting started with copy-pasteable commands", () => {
    expectSection(FILE, h2, "Getting started", { minWords: 10, needsCode: true });
  });

  it("explains at least 3 design decisions with reasoning", () => {
    const s = expectSection(FILE, h2, "Design decisions", { minWords: 120 });
    const subsections = sections(s.body, 3).length;
    const items = bullets(s.body).length;
    expect(
      Math.max(subsections, items),
      `"Design decisions" should cover at least 3 decisions, as ### subsections or bullets (found ${Math.max(subsections, items)})`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("describes how it's tested", () => {
    expectSection(FILE, h2, "Testing", { minWords: 30 });
  });

  it("has a What I'd do next section with at least 3 items", () => {
    expectSection(FILE, h2, "What I'd do next", { minBullets: 3 });
  });

  it("has no leftover template placeholders", () => {
    expectNoLeftovers(FILE, md);
  });
});
