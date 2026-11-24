import { describe, expect, it } from "vitest";
import type { BoardState, Card } from "../src/domain/board";
import { boardReducer } from "../src/state/boardReducer";

const card = (id: string, columnId: Card["columnId"] = "todo", title = `Card ${id}`): Card => ({ id, title, columnId });

/** Freeze the whole state so any mutation inside the reducer throws a TypeError. */
function frozen(cards: Card[]): BoardState {
  return Object.freeze({ cards: Object.freeze(cards.map((c) => Object.freeze({ ...c }))) as Card[] });
}

const ids = (state: BoardState) => state.cards.map((c) => `${c.id}:${c.columnId}`);

describe("boardReducer (TODO 1)", () => {
  describe("card/added", () => {
    it("appends the card with a trimmed title", () => {
      const state = frozen([card("a")]);
      const next = boardReducer(state, { type: "card/added", card: card("b", "todo", "  Write tests  ") });
      expect(ids(next)).toEqual(["a:todo", "b:todo"]);
      expect(next.cards[1]?.title).toBe("Write tests");
    });

    it("ignores a blank title and returns the same state object", () => {
      const state = frozen([card("a")]);
      expect(boardReducer(state, { type: "card/added", card: card("b", "todo", "   ") })).toBe(state);
    });

    it("ignores a duplicate id and returns the same state object", () => {
      const state = frozen([card("a")]);
      expect(boardReducer(state, { type: "card/added", card: card("a", "doing", "Other") })).toBe(state);
    });
  });

  describe("card/moved", () => {
    it("changes the column and moves the card to the end of the list", () => {
      const state = frozen([card("a"), card("b", "doing"), card("c")]);
      const next = boardReducer(state, { type: "card/moved", cardId: "a", to: "doing" });
      expect(ids(next)).toEqual(["b:doing", "c:todo", "a:doing"]);
    });

    it("keeps the other card fields", () => {
      const state = frozen([card("a", "todo", "Keep me")]);
      const next = boardReducer(state, { type: "card/moved", cardId: "a", to: "done" });
      expect(next.cards[0]).toEqual({ id: "a", title: "Keep me", columnId: "done" });
    });

    it("is a no-op (same object) for an unknown card", () => {
      const state = frozen([card("a")]);
      expect(boardReducer(state, { type: "card/moved", cardId: "zzz", to: "done" })).toBe(state);
    });

    it("is a no-op (same object) when the card is already in that column", () => {
      const state = frozen([card("a", "doing"), card("b")]);
      expect(boardReducer(state, { type: "card/moved", cardId: "a", to: "doing" })).toBe(state);
    });
  });

  describe("card/removed", () => {
    it("removes the card", () => {
      const state = frozen([card("a"), card("b"), card("c")]);
      expect(ids(boardReducer(state, { type: "card/removed", cardId: "b" }))).toEqual(["a:todo", "c:todo"]);
    });

    it("is a no-op (same object) for an unknown card", () => {
      const state = frozen([card("a")]);
      expect(boardReducer(state, { type: "card/removed", cardId: "nope" })).toBe(state);
    });
  });

  describe("column/cleared", () => {
    it("removes every card in that column and keeps the rest in order", () => {
      const state = frozen([card("a", "done"), card("b"), card("c", "done"), card("d", "doing")]);
      expect(ids(boardReducer(state, { type: "column/cleared", columnId: "done" }))).toEqual(["b:todo", "d:doing"]);
    });

    it("is a no-op (same object) when the column is already empty", () => {
      const state = frozen([card("a")]);
      expect(boardReducer(state, { type: "column/cleared", columnId: "done" })).toBe(state);
    });
  });

  it("never mutates its input (all inputs here are frozen; a mutation would throw)", () => {
    const state = frozen([card("a"), card("b", "doing")]);
    const snapshot = JSON.stringify(state);
    boardReducer(state, { type: "card/added", card: card("c") });
    boardReducer(state, { type: "card/moved", cardId: "a", to: "done" });
    boardReducer(state, { type: "card/removed", cardId: "b" });
    boardReducer(state, { type: "column/cleared", columnId: "doing" });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
