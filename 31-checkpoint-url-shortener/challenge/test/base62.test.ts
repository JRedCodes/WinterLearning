import { describe, expect, it } from "vitest";
import { fromBase62, toBase62 } from "../src/lib/base62.js";

describe("base62", () => {
  it("encodes small numbers with the 0-9A-Za-z alphabet", () => {
    expect(toBase62(0n)).toBe("0");
    expect(toBase62(9n)).toBe("9");
    expect(toBase62(10n)).toBe("A");
    expect(toBase62(35n)).toBe("Z");
    expect(toBase62(36n)).toBe("a");
    expect(toBase62(61n)).toBe("z");
    expect(toBase62(62n)).toBe("10");
    expect(toBase62(3843n)).toBe("zz");
  });

  it("decodes back", () => {
    expect(fromBase62("0")).toBe(0n);
    expect(fromBase62("z")).toBe(61n);
    expect(fromBase62("10")).toBe(62n);
    expect(fromBase62("zz")).toBe(3843n);
  });

  it("round-trips large values (62^7 - 1 is the largest 7-character code)", () => {
    const max7 = 62n ** 7n - 1n;
    expect(toBase62(max7)).toBe("zzzzzzz");
    for (const n of [1n, 123_456_789n, 3_521_614_606_207n, max7, 2n ** 64n]) {
      expect(fromBase62(toBase62(n))).toBe(n);
    }
  });

  it("rejects invalid input", () => {
    expect(() => fromBase62("")).toThrow();
    expect(() => fromBase62("ab-c")).toThrow();
    expect(() => toBase62(-1n)).toThrow();
  });
});
