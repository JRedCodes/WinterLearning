import { describe, expect, it } from "vitest";
import { murmur2, partitionFor, toPositive } from "../src/messaging/partitioner.js";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("murmur2 (TODO 1)", () => {
  // Reference values produced by the Kafka Java client's Utils.murmur2 (and kafkajs).
  const vectors: Array<[string, number]> = [
    ["21", -973932308],
    ["foobar", -790332482],
    ["a-little-bit-long-string", -985981536],
    ["a-little-bit-longer-string", -1486304829],
    ["lkjh234lh9fiuh90y23oiuhsafujhadof229phr9h19h89h8", -58897971],
    ["", 275646681],
    ["a", -1563381124],
    ["ab", 316155434],
    ["abc", 479470107],
  ];

  it.each(vectors)("murmur2(%j) matches the Java client", (input, expected) => {
    expect(murmur2(bytes(input))).toBe(expected);
  });

  it("hashes UTF-8 bytes, not UTF-16 code units", () => {
    expect(murmur2(bytes("é")), "\"é\" is 2 bytes in UTF-8").toBe(186971271);
    expect(murmur2(bytes("🚀")), "\"🚀\" is 4 bytes in UTF-8").toBe(761778625);
  });
});

describe("toPositive (TODO 1)", () => {
  it("clears the sign bit instead of taking the absolute value", () => {
    expect(toPositive(5)).toBe(5);
    expect(toPositive(-1)).toBe(0x7fffffff);
    expect(toPositive(-973932308)).toBe(1173551340);
    expect(toPositive(-2147483648)).toBe(0);
  });
});

describe("partitionFor (TODO 1)", () => {
  it("matches Kafka's default partitioner for known keys", () => {
    expect(partitionFor("order-1", 3)).toBe(1);
    expect(partitionFor("order-2", 3)).toBe(0);
    expect(partitionFor("a-little-bit-longer-string", 12)).toBe(11);
    expect(partitionFor("foobar", 12)).toBe(6);
    expect(partitionFor("cust-7", 6)).toBe(1);
  });

  it("always sends the same key to the same partition", () => {
    for (let i = 0; i < 50; i++) {
      const key = `order-${i}`;
      expect(partitionFor(key, 6)).toBe(partitionFor(key, 6));
    }
  });

  it("returns a partition in range [0, n)", () => {
    for (const n of [1, 2, 3, 7, 50]) {
      for (let i = 0; i < 200; i++) {
        const p = partitionFor(`key-${i}`, n);
        expect(Number.isInteger(p) && p >= 0 && p < n, `partitionFor("key-${i}", ${n}) = ${p}`).toBe(true);
      }
    }
  });

  it("spreads many keys roughly evenly over the partitions", () => {
    const n = 4;
    const counts = new Array<number>(n).fill(0);
    for (let i = 0; i < 4000; i++) counts[partitionFor(`customer-${i}`, n)]!++;
    for (const c of counts) {
      expect(c, `partition counts ${JSON.stringify(counts)} are too uneven`).toBeGreaterThan(800);
      expect(c, `partition counts ${JSON.stringify(counts)} are too uneven`).toBeLessThan(1200);
    }
  });

  it("rejects an invalid partition count", () => {
    expect(() => partitionFor("x", 0)).toThrow(RangeError);
    expect(() => partitionFor("x", 2.5)).toThrow(RangeError);
  });
});
