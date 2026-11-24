import { Board } from "./components/Board";
import { useBoard } from "./hooks/useBoard";

/**
 * TODO(6b): add the filter.
 *
 *  - Keep the filter text in state HERE (App is the closest common parent of
 *    the input and the board: "lifting state up").
 *  - Render <FilterInput> above the board.
 *  - Pass filterCards(cards, filter) to <Board>. Compute it during render.
 *    Do NOT copy filtered cards into another useState via useEffect.
 *  - Always render an element with role="status" (a live region: screen
 *    readers announce changes to its text). While the filter is non-blank it
 *    says "Showing X of Y cards" (X = visible, Y = total); otherwise it is empty.
 */
export function App() {
  const { cards, addCard, moveCard, removeCard, clearColumn } = useBoard();

  return (
    <main className="app">
      <h1>Kanban-lite</h1>
      <Board cards={cards} onAdd={addCard} onMove={moveCard} onRemove={removeCard} onClear={clearColumn} />
    </main>
  );
}
