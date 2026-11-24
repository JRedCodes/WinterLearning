import type { ReactNode } from "react";
import type { Card as CardModel, ColumnDef, ColumnId } from "../domain/board";
import { Card } from "./Card";

export interface ColumnProps {
  column: ColumnDef;
  cards: CardModel[];
  onMove: (cardId: string, to: ColumnId) => void;
  onRemove: (cardId: string) => void;
  /** Extra UI rendered under the heading (the add form, a "clear" button...). */
  children?: ReactNode;
}

/**
 * TODO(3): one column of the board.
 *
 *  - Render a <section> labelled by its <h2> heading (aria-labelledby + useId),
 *    so it is a landmark "region" named e.g. "To do".
 *  - Under the heading, a count: "0 cards", "1 card", "2 cards".
 *  - Then `children`.
 *  - Then either a <ul> of <Card>s (one per card, with a proper `key`), or,
 *    when there are no cards, the text "No cards".
 *  - Forward onMove/onRemove to every Card.
 */
export function Column({ column, cards }: ColumnProps) {
  return (
    <div>
      <h2>{column.title}</h2>
      {cards.map((card) => (
        <p>{card.title}</p>
      ))}
    </div>
  );
}
