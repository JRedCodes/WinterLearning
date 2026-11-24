# Hints · React Fundamentals

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: The reducer

<details><summary>Hint 1</summary>

Start with a `switch (action.type)`. Inside each `case`, TypeScript knows exactly which action you have, so `action.cardId` only autocompletes where it exists. For each case, first ask "is this a no-op?" and `return state` early.
</details>

<details><summary>Hint 2</summary>

The immutable toolkit: `[...arr, item]` to add, `arr.filter(...)` to remove, `{ ...obj, field: value }` to change a field. For "no-op" checks: `arr.some(c => c.id === id)`, `arr.find(...)`, or compare `filtered.length` with the original length.
</details>

<details><summary>Hint 3</summary>

Moving: find the card; if missing or `card.columnId === action.to`, return `state`. Otherwise `[...cards.filter(c => c.id !== id), { ...card, columnId: action.to }]` and wrap it in `{ ...state, cards }`. Removing and clearing are a `filter` plus "did the length change?".
</details>

## TODO 2: `useLocalStorage`

<details><summary>Hint 1</summary>

Three separate jobs: read once at the start, write when the value changes, listen for other tabs. Each one maps to a different React tool.
</details>

<details><summary>Hint 2</summary>

Read once: `useState(() => ...)` (a function, so it's lazy). Write: a `useEffect` with `[key, value]` dependencies. Listen: another `useEffect` that calls `window.addEventListener("storage", handler)` and returns a cleanup that removes **the same** handler. Wrap `JSON.parse` in `try/catch`.
</details>

<details><summary>Hint 3</summary>

React's own `setValue` from `useState` already accepts values and updater functions and is stable across renders, so you can return it directly. In the storage handler: ignore events whose `key` isn't yours; `newValue === null` means removed (use the initial value; keep it in a `useRef` so it isn't an effect dependency); otherwise try to parse and `setValue(parsed)`.
</details>

## TODO 3: Column

<details><summary>Hint 1</summary>

A `<section>` only counts as a "region" for assistive tech (and for `getByRole("region")`) when it has an accessible name. Where can a name come from?
</details>

<details><summary>Hint 2</summary>

`const headingId = useId();` then `<section aria-labelledby={headingId}><h2 id={headingId}>...`. For the count, a tiny helper `n === 1 ? "card" : "cards"`.
</details>

<details><summary>Hint 3</summary>

`{cards.length === 0 ? <p>No cards</p> : <ul>{cards.map(card => <Card key={card.id} ... />)}</ul>}`. The key goes on the element returned from `map`, and it should be the card id, not the index.
</details>

## TODO 4: Card

<details><summary>Hint 1</summary>

`neighbourColumn(card.columnId, "left")` returns the column definition or `undefined`. Render a button only when it's defined.
</details>

<details><summary>Hint 2</summary>

The visible text can be short ("← To do") while `aria-label` provides the full accessible name (`Move ${card.title} to ${left.title}`). The accessible name is what the tests (and screen readers) use.
</details>

<details><summary>Hint 3</summary>

`<li><article aria-labelledby={titleId}><h3 id={titleId}>{card.title}</h3> ...buttons... </article></li>`, each button with `type="button"` and `onClick={() => onMove(card.id, left.id)}`.
</details>

## TODO 5: AddCardForm

<details><summary>Hint 1</summary>

You need two pieces of state: the input text and the current error (or `null`). Handle the form's `onSubmit`, not the button's `onClick`: that way Enter works for free.
</details>

<details><summary>Hint 2</summary>

First line of the submit handler: `event.preventDefault()`. Connect the label with `htmlFor={id}` + `id={id}` (from `useId`). In `onChange`, update the text **and** clear the error.
</details>

<details><summary>Hint 3</summary>

```
submit:
  prevent default
  trimmed = title.trim()
  problem = validateTitle(trimmed)
  if problem: setError(problem); return      // keep the text
  onAdd(trimmed); setTitle("")
render error as <p role="alert">, and aria-invalid={error ? true : undefined} on the input
```
</details>

## TODO 6: Filter

<details><summary>Hint 1</summary>

Which components need the filter text? Find their closest common parent: that's where the state goes.
</details>

<details><summary>Hint 2</summary>

`filterCards`: `const q = query.trim().toLowerCase(); if (!q) return cards;` then a `filter` with `includes`. In `App`: `useState("")`, render `<FilterInput value={filter} onChange={setFilter} />`, and compute `const visible = filterCards(cards, filter)` right in the function body.
</details>

<details><summary>Hint 3</summary>

Render the status element unconditionally: `<p role="status">{isFiltering ? `Showing ${visible.length} of ${cards.length} cards` : ""}</p>`. Live regions work best when they exist before their text changes. Pass `visible` (not `cards`) to `<Board>`.
</details>
