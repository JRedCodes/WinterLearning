import { describe, expect, it } from "vitest";
import {
  findSection,
  hasCodeBlock,
  itemCount,
  leftovers,
  normalize,
  numericTokens,
  readDoc,
  sections,
  stripComments,
  wordCount,
  type Section,
} from "./lib/markdown.js";

/**
 * The five designs you write, and the problem-specific ideas each one must at least mention.
 * The keyword checks are deliberately loose (any one of the alternatives counts): they make sure
 * you engaged with the problem's central difficulty, not that you used our exact words.
 */
const DESIGNS: { file: string; title: string; mustMention: { idea: string; any: RegExp }[] }[] = [
  {
    file: "designs/news-feed.md",
    title: "News feed",
    mustMention: [
      { idea: "fan-out on write vs fan-out on read", any: /fan.?out/i },
      { idea: "the celebrity / hot-user problem", any: /celebrit|hot user|high.?follower|influencer/i },
      { idea: "how the feed is paginated", any: /cursor|pagination|paginate/i },
    ],
  },
  {
    file: "designs/notification-system.md",
    title: "Notification system",
    mustMention: [
      { idea: "a queue between the API and the senders", any: /queue|stream|topic/i },
      { idea: "retries and what happens after the last one", any: /retr(y|ies)/i },
      { idea: "deduplication / idempotency", any: /idempoten|dedup/i },
      { idea: "user preferences or opt-out", any: /preference|opt.?out|unsubscribe/i },
    ],
  },
  {
    file: "designs/chat.md",
    title: "Chat",
    mustMention: [
      { idea: "a persistent connection (WebSocket or similar)", any: /websocket|long.?poll|\bsse\b|persistent connection/i },
      { idea: "message ordering", any: /order(ing|ed)?\b/i },
      { idea: "delivering to offline users", any: /offline/i },
      { idea: "routing a message to the server that holds the recipient's connection", any: /presence|connection registry|session (service|registry)|which server|gateway/i },
    ],
  },
  {
    file: "designs/rate-limiter.md",
    title: "Rate limiter",
    mustMention: [
      { idea: "the algorithm (token bucket, sliding window, ...)", any: /token bucket|sliding window|fixed window|leaky bucket|gcra/i },
      { idea: "atomicity of the check-and-increment", any: /atomic|lua|race/i },
      { idea: "fail open vs fail closed", any: /fail.?(open|closed)/i },
      { idea: "the 429 response contract", any: /429|retry-after/i },
    ],
  },
  {
    file: "designs/ticketing.md",
    title: "Ticketing",
    mustMention: [
      { idea: "preventing double booking", any: /double.?book|oversell|over.?sell/i },
      { idea: "temporary seat holds that expire", any: /hold|reserv/i },
      { idea: "idempotent payment / booking requests", any: /idempoten/i },
      { idea: "the on-sale traffic spike", any: /spike|surge|thundering|waiting room|queue/i },
    ],
  },
];

interface Rule {
  heading: string;
  minWords: number;
  why: string;
  extra?: (s: Section, where: string) => void;
}

const RULES: Rule[] = [
  {
    heading: "Requirements",
    minWords: 90,
    why: "state functional AND non-functional requirements, plus what's out of scope",
    extra: (s, where) => {
      const body = normalize(stripComments(s.body));
      expect(body, `${where} should label the functional requirements ("Functional")`).toMatch(/\bfunctional\b/);
      expect(body, `${where} should label the non-functional requirements ("Non-functional")`).toMatch(/non functional/);
    },
  },
  {
    heading: "Estimates",
    minWords: 70,
    why: "back-of-envelope numbers: QPS (average and peak), storage, bandwidth, and what they imply",
    extra: (s, where) => {
      const n = numericTokens(s.body).length;
      expect(n, `${where} needs actual numbers (found ${n}, want at least 6). Show the arithmetic.`).toBeGreaterThanOrEqual(6);
    },
  },
  {
    heading: "API",
    minWords: 40,
    why: "the main endpoints or messages, with request/response shapes",
    extra: (s, where) => {
      const hasEndpoint = /\b(GET|POST|PUT|PATCH|DELETE)\s+\//.test(s.body) || hasCodeBlock(s.body);
      expect(hasEndpoint, `${where} should list endpoints like "POST /v1/..." or show messages in a code block`).toBe(true);
    },
  },
  {
    heading: "Data Model",
    minWords: 60,
    why: "the main entities, their keys, the access patterns and which store each lives in",
  },
  {
    heading: "High-Level Design",
    minWords: 100,
    why: "a diagram of the components plus a walk-through of the main flows",
    extra: (s, where) => {
      expect(hasCodeBlock(s.body, "mermaid"), `${where} needs a \`\`\`mermaid diagram`).toBe(true);
    },
  },
  {
    heading: "Deep Dives",
    minWords: 250,
    why: "at least two of the hardest parts explored in depth, each as a ### subsection",
    extra: (s, where) => {
      const n = sections(s.body, 3).length;
      expect(n, `${where} needs at least 2 "### ..." subsections (found ${n})`).toBeGreaterThanOrEqual(2);
    },
  },
  {
    heading: "Trade-offs",
    minWords: 100,
    why: "the decisions you made, what you gave up, and what you'd revisit at 10x scale",
    extra: (s, where) => {
      const n = itemCount(s.body);
      expect(n, `${where} should list at least 3 trade-offs (bullets, table rows or ### subsections; found ${n})`).toBeGreaterThanOrEqual(3);
    },
  },
  {
    heading: "Failure Modes",
    minWords: 80,
    why: "what breaks (a node, a dependency, a region, a traffic spike) and how the system behaves",
    extra: (s, where) => {
      const n = itemCount(s.body);
      expect(n, `${where} should cover at least 4 failure scenarios (bullets, table rows or ### subsections; found ${n})`).toBeGreaterThanOrEqual(4);
    },
  },
];

describe("TEMPLATE.md is intact", () => {
  it("still has every required heading (the other files are checked against it)", () => {
    const tpl = readDoc("TEMPLATE.md");
    expect(tpl, "TEMPLATE.md is missing from challenge/. Restore it from git.").not.toBeNull();
    const h2 = sections(tpl ?? "", 2);
    for (const r of RULES) expect(findSection(h2, r.heading), `TEMPLATE.md lost "## ${r.heading}"`).toBeDefined();
  });
});

for (const design of DESIGNS) {
  describe(design.file, () => {
    const md = readDoc(design.file);

    it("exists", () => {
      expect(md, `${design.file} is missing. Copy TEMPLATE.md (or restore the starter file).`).not.toBeNull();
    });
    if (md === null) return;

    const h2 = sections(md, 2);

    it("has an H1 title naming the system", () => {
      const h1 = sections(md, 1);
      expect(h1.length, `${design.file} needs exactly one "# ..." title`).toBe(1);
      expect(normalize(h1[0]?.title ?? "")).toContain(normalize(design.title).split(" ")[0]!);
    });

    it("has the required sections in the template's order", () => {
      const positions = RULES.map((r) => h2.findIndex((s) => s === findSection(h2, r.heading)));
      const missing = RULES.filter((_, i) => positions[i] === -1).map((r) => `"## ${r.heading}"`);
      expect(missing, `${design.file} is missing sections`).toEqual([]);
      const sorted = [...positions].sort((a, b) => a - b);
      expect(positions, `${design.file}: keep the sections in the template's order`).toEqual(sorted);
    });

    for (const rule of RULES) {
      it(`## ${rule.heading}: ${rule.why}`, () => {
        const section = findSection(h2, rule.heading);
        expect(section, `${design.file}: missing "## ${rule.heading}"`).toBeDefined();
        if (!section) return;
        const where = `${design.file} › "${section.title}"`;
        const n = wordCount(section.body);
        expect(
          n,
          `${where} needs at least ${rule.minWords} words of your own (has ${n}). Template comments and diagrams don't count.`,
        ).toBeGreaterThanOrEqual(rule.minWords);
        rule.extra?.(section, where);
      });
    }

    it("engages with the problem's central difficulties", () => {
      const text = stripComments(md);
      const missed = design.mustMention.filter((m) => !m.any.test(text)).map((m) => m.idea);
      expect(missed, `${design.file} never discusses: ${missed.join("; ")}`).toEqual([]);
    });

    it("has no leftover template placeholders", () => {
      const left = leftovers(md);
      expect(left, `${design.file} still has placeholders (TODO or <Like This>):\n  ${left.join("\n  ")}`).toEqual([]);
    });
  });
}
