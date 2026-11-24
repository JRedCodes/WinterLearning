import { useCallback, useEffect, useReducer } from "react";
import { EMPTY_BOARD, type BoardState, type ColumnId } from "../domain/board";
import { boardReducer } from "../state/boardReducer";
import { useLocalStorage } from "./useLocalStorage";

export const BOARD_STORAGE_KEY = "wl:R1:board";

/**
 * The board's state + the operations the UI is allowed to perform.
 * Components call `addCard("Buy milk")`; they never see actions or storage.
 *
 * Persistence: the reducer owns the live state; localStorage gets a copy after
 * every change. Syncing React state to an EXTERNAL system is exactly what
 * effects are for.
 */
export function useBoard() {
  const [stored, setStored] = useLocalStorage<BoardState>(BOARD_STORAGE_KEY, EMPTY_BOARD);
  const [board, dispatch] = useReducer(boardReducer, stored);

  useEffect(() => {
    setStored(board);
  }, [board, setStored]);

  const addCard = useCallback((title: string) => {
    dispatch({ type: "card/added", card: { id: crypto.randomUUID(), title, columnId: "todo" } });
  }, []);
  const moveCard = useCallback((cardId: string, to: ColumnId) => {
    dispatch({ type: "card/moved", cardId, to });
  }, []);
  const removeCard = useCallback((cardId: string) => {
    dispatch({ type: "card/removed", cardId });
  }, []);
  const clearColumn = useCallback((columnId: ColumnId) => {
    dispatch({ type: "column/cleared", columnId });
  }, []);

  return { cards: board.cards, addCard, moveCard, removeCard, clearColumn };
}
