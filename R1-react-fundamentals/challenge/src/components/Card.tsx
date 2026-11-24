import type { Card as CardModel, ColumnId } from "../domain/board";

export interface CardProps {
  card: CardModel;
  onMove: (cardId: string, to: ColumnId) => void;
  onRemove: (cardId: string) => void;
}

/**
 * TODO(4): one card on the board.
 *
 * Markup (tests find things by ROLE and accessible NAME, the way a user or a
 * screen reader would):
 *  - an <li> that contains an <article> whose accessible name is the card
 *    title. Render the title in an <h3> and point aria-labelledby at it
 *    (useId() gives you a unique id).
 *  - a "move left" button, ONLY if there is a column to the left, with the
 *    accessible name `Move <title> to <left column title>` and visible text
 *    like "← To do". Clicking it calls onMove(card.id, <left column id>).
 *  - a "move right" button, same idea, only if there is a column to the right.
 *  - a delete button named `Delete <title>` that calls onRemove(card.id).
 *
 * Use neighbourColumn() from ../domain/board. All buttons need type="button".
 */
export function Card({ card }: CardProps) {
  return <li>{card.title}</li>;
}
