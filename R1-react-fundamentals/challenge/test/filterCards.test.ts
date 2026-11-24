import { describe, expect, it } from "vitest";
import { filterCards, type Card } from "../src/domain/board";

const cards: Card[] = [
  { id: "1", title: "Write README", columnId: "todo" },
  { id: "2", title: "Review PR #42", columnId: "doing" },
  { id: "3", title: "Deploy to staging", columnId: "done" },
];

describe("filterCards (TODO 6a)", () => {
  it("matches titles case-insensitively", () => {
    expect(filterCards(cards, "readme").map((c) => c.id)).toEqual(["1"]);
    expect(filterCards(cards, "R").map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("trims the query", () => {
    expect(filterCards(cards, "  staging ").map((c) => c.id)).toEqual(["3"]);
  });

  it("returns the same array for a blank query", () => {
    expect(filterCards(cards, "")).toBe(cards);
    expect(filterCards(cards, "   ")).toBe(cards);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterCards(cards, "kubernetes")).toEqual([]);
  });
});
