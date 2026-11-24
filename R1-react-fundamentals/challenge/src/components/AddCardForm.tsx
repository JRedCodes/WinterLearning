import { MAX_TITLE_LENGTH } from "../domain/board";

export interface AddCardFormProps {
  /** Called with the TRIMMED title when the user submits a valid one. */
  onAdd: (title: string) => void;
}

/**
 * TODO(5): a controlled form for new cards.
 *
 *  - A text input labelled "New card title" (a real <label>, connected to the
 *    input) whose value lives in React state.
 *  - A submit button "Add card". Submitting (button click OR Enter) must not
 *    reload the page.
 *  - On submit, trim the title, then validate with validateTitle():
 *      invalid -> show the error in an element with role="alert", do NOT call onAdd
 *      valid   -> call onAdd(trimmedTitle) and clear the input
 *  - The error disappears as soon as the user edits the input again.
 *  - Mark the input aria-invalid="true" while an error is shown.
 */
export function AddCardForm(_props: AddCardFormProps) {
  return (
    <form>
      <input placeholder="New card" />
      <button>Add</button>
    </form>
  );
}

/** Returns an error message, or null when the (already trimmed) title is fine. */
export function validateTitle(title: string): string | null {
  if (title.length === 0) return "Title is required";
  if (title.length > MAX_TITLE_LENGTH) return `Title must be ${MAX_TITLE_LENGTH} characters or fewer`;
  return null;
}
