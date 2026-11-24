import type { BoardState, Card, ColumnId } from "../domain/board";

/**
 * Every change to the board is described by one of these actions.
 * Notice that "card/added" carries the id: generating ids (randomness) is a
 * side effect, so it happens BEFORE dispatch, never inside the reducer.
 */
export type BoardAction =
  | { type: "card/added"; card: Card }
  | { type: "card/moved"; cardId: string; to: ColumnId }
  | { type: "card/removed"; cardId: string }
  | { type: "column/cleared"; columnId: ColumnId };

/**
 * TODO(1): the board reducer. A PURE function: (state, action) -> next state.
 *
 * Rules:
 *  - Never mutate `state` or anything inside it. Return new objects/arrays.
 *  - When an action changes nothing, return the SAME `state` object
 *    (React then skips the re-render).
 *
 *  "card/added"     append the card. Trim its title. Ignore (no-op) when the
 *                   trimmed title is empty or a card with that id already exists.
 *  "card/moved"     move the card to column `to` AND to the end of the array, so
 *                   it shows up at the bottom of the target column.
 *                   No-op if the card doesn't exist or is already in `to`.
 *  "card/removed"   remove the card. No-op if it doesn't exist.
 *  "column/cleared" remove every card in that column. No-op if there are none.
 *
 * Tip: a `switch (action.type)` narrows `action` in each case. Add a
 * `default` branch that assigns `action` to `never` so TypeScript tells you
 * when a new action type is unhandled.
 */
export function boardReducer(state: BoardState, _action: BoardAction): BoardState {
  return state;
}
