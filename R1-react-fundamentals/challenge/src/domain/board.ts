/**
 * Domain types for the board. Plain data, no React. Everything that can be
 * expressed without React lives here or in ../state, so it can be unit-tested
 * without rendering anything.
 */

export const COLUMNS = [
  { id: "todo", title: "To do" },
  { id: "doing", title: "Doing" },
  { id: "done", title: "Done" },
] as const;

export type ColumnId = (typeof COLUMNS)[number]["id"];
export type ColumnDef = (typeof COLUMNS)[number];

export interface Card {
  id: string;
  title: string;
  columnId: ColumnId;
}

export interface BoardState {
  /** All cards, in display order. A column shows the cards whose columnId matches, in array order. */
  cards: Card[];
}

export const EMPTY_BOARD: BoardState = { cards: [] };

export const MAX_TITLE_LENGTH = 80;

/** The column to the left/right of `id`, or undefined at the edges. */
export function neighbourColumn(id: ColumnId, direction: "left" | "right"): ColumnDef | undefined {
  const index = COLUMNS.findIndex((c) => c.id === id);
  return COLUMNS[direction === "left" ? index - 1 : index + 1];
}

/**
 * TODO(6a): return the cards whose title contains `query`, ignoring case and
 * surrounding whitespace in the query. An empty/blank query returns `cards`
 * itself (same array reference, so nothing downstream re-renders needlessly).
 * Must not mutate the input.
 */
export function filterCards(cards: Card[], _query: string): Card[] {
  return cards;
}
