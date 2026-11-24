import { COLUMNS, type Card, type ColumnId } from "../domain/board";
import { AddCardForm } from "./AddCardForm";
import { Column } from "./Column";

export interface BoardProps {
  cards: Card[];
  onAdd: (title: string) => void;
  onMove: (cardId: string, to: ColumnId) => void;
  onRemove: (cardId: string) => void;
  onClear: (columnId: ColumnId) => void;
}

/**
 * Lays out the three columns. Purely presentational: it receives data and
 * callbacks and owns no state. Note the composition: Column doesn't know about
 * forms or "clear" buttons, Board slots them in as children.
 */
export function Board({ cards, onAdd, onMove, onRemove, onClear }: BoardProps) {
  return (
    <div className="board">
      {COLUMNS.map((column) => {
        const columnCards = cards.filter((c) => c.columnId === column.id);
        return (
          <Column key={column.id} column={column} cards={columnCards} onMove={onMove} onRemove={onRemove}>
            {column.id === "todo" && <AddCardForm onAdd={onAdd} />}
            {column.id === "done" && columnCards.length > 0 && (
              <button type="button" onClick={() => onClear("done")}>
                Clear done
              </button>
            )}
          </Column>
        );
      })}
    </div>
  );
}
