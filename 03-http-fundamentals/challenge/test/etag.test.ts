import { describe, expect, it } from "vitest";
import { computeEtag, ifNoneMatchMatches } from "../src/etag.js";

describe("computeEtag (TODO 2)", () => {
  it("is a quoted string", () => {
    expect(computeEtag("hello")).toMatch(/^"[^"]+"$/);
  });

  it("is deterministic for the same body", () => {
    expect(computeEtag('{"a":1}')).toBe(computeEtag('{"a":1}'));
  });

  it("changes when the body changes", () => {
    expect(computeEtag('{"a":1}')).not.toBe(computeEtag('{"a":2}'));
  });

  it("is a strong validator (no W/ prefix)", () => {
    expect(computeEtag("x").startsWith("W/")).toBe(false);
  });
});

describe("ifNoneMatchMatches (TODO 2)", () => {
  const tag = '"abc"';

  it("is false when the header is absent", () => {
    expect(ifNoneMatchMatches(undefined, tag)).toBe(false);
  });

  it("matches the exact tag", () => {
    expect(ifNoneMatchMatches('"abc"', tag)).toBe(true);
    expect(ifNoneMatchMatches('"abd"', tag)).toBe(false);
  });

  it("matches any tag in a comma-separated list", () => {
    expect(ifNoneMatchMatches('"x", "abc" ,"y"', tag)).toBe(true);
    expect(ifNoneMatchMatches('"x", "y"', tag)).toBe(false);
  });

  it("uses weak comparison: W/\"abc\" matches \"abc\"", () => {
    expect(ifNoneMatchMatches('W/"abc"', tag)).toBe(true);
  });

  it("treats * as matching any current representation", () => {
    expect(ifNoneMatchMatches("*", tag)).toBe(true);
  });

  it("does not match an unquoted value", () => {
    expect(ifNoneMatchMatches("abc", tag)).toBe(false);
  });
});
