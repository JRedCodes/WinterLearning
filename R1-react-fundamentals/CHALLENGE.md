# Challenge · Kanban-lite

**Type:** 🧩 Scaffold · **Est:** 3–4h · **Services:** none

## Scenario

> **#internal-tools** · *Marco (frontend lead):* The platform team wants a tiny personal board for on-call follow-ups: three columns, add/move/delete cards, a filter, and it must survive a page reload (no backend yet, localStorage is fine). I set up Vite, the domain types, the `Board` layout and `useBoard()`. The tests describe what we agreed with design and accessibility review. Our a11y reviewer will check that every control has a proper name, so build on real buttons, labels and headings, not clickable `<div>`s. Can you fill in the TODOs?

## Your task

Work through the numbered `TODO(n)` comments in `challenge/src/`:

| TODO | File | What |
|---|---|---|
| 1 | `state/boardReducer.ts` | Pure reducer: add, move, remove, clear column. No mutation, same object on no-ops |
| 2 | `hooks/useLocalStorage.ts` | `useState` that persists to localStorage, reads lazily once, syncs across tabs, cleans up |
| 3 | `components/Column.tsx` | Labelled region with heading, card count, children slot, list with keys, empty state |
| 4 | `components/Card.tsx` | Card article with move-left/move-right/delete buttons that have accessible names |
| 5 | `components/AddCardForm.tsx` | Controlled form with validation and an accessible error |
| 6 | `domain/board.ts` (6a), `App.tsx` (6b) | `filterCards()` and wiring the filter into the app (lifted state, derived data, live status) |

Already provided and working: `domain/board.ts` types, `hooks/useBoard.ts`, `components/Board.tsx`, `components/FilterInput.tsx`, `main.tsx`.

A suggested order: 1 → 6a (pure functions first, fast feedback) → 4 → 3 → 5 → 2 → 6b.

## Acceptance criteria

- [ ] **Reducer** (`test/boardReducer.test.ts`): appends with trimmed title; ignores blank titles and duplicate ids; moves a card to the target column and to the end; removes; clears a column; returns the **same state object** for every no-op; never mutates its input.
- [ ] **filterCards** (`test/filterCards.test.ts`): case-insensitive, trimmed query, blank query returns the same array.
- [ ] **useLocalStorage** (`test/useLocalStorage.test.tsx`): initial value when empty or invalid JSON; reads storage exactly once; setter accepts value or updater and writes JSON; survives remount; syncs from `storage` events for its key (removal → initial value; other keys and invalid JSON ignored); removes its listener on unmount; stable setter.
- [ ] **Card** (`test/Card.test.tsx`): `<li>` with an `<article>` named by its `<h3>`; move buttons only where a neighbouring column exists, named `Move <title> to <column>`; `Delete <title>` button; all buttons `type="button"`.
- [ ] **Column** (`test/Column.test.tsx`): region named by its `<h2>`; "N card(s)" count with correct plural; children rendered; list of cards in order with keys (no React key warning); "No cards" empty state without a list; callbacks forwarded.
- [ ] **AddCardForm** (`test/AddCardForm.test.tsx`): input labelled "New card title"; submit via button or Enter; trims, calls `onAdd`, clears; blank or >80 chars shows a `role="alert"` error, sets `aria-invalid`, keeps the text, doesn't call `onAdd`; error clears on edit.
- [ ] **App** (`test/App.test.tsx`): add, move across columns, clear Done, delete, filter across columns with a `role="status"` "Showing X of Y cards" message (empty when not filtering), and the board survives an unmount/remount via localStorage.
- [ ] `npm test` and `npm run typecheck` pass.

## Getting started

```bash
cd R1-react-fundamentals/challenge
make install
make test          # see what fails, then work TODO by TODO
make dev           # http://localhost:5173 : click around while you work
```

`npm run test:watch` reruns tests on save. `npx vitest run test/boardReducer.test.ts` runs a single file.

Try it in the browser too: add cards, reload the page, open the app in a second tab and watch the storage sync with your `useLocalStorage` (see the stretch goal about the board not reacting to it yet).

## Rules

- Don't modify the tests.
- No extra dependencies (no state libraries, no UI kits).
- Keep the reducer pure and the components presentational: components receive data and callbacks, `useBoard` owns the state.
- No `useEffect` for derived data (the filtered list, the status text).
- Use semantic elements (`button`, `label`, `h2`, `section`, `ul`/`li`). No `onClick` on `div`s.

## Stretch goals

1. **Cross-tab board sync.** `useLocalStorage` now syncs across tabs, but `useBoard` seeds `useReducer` only once, so the board ignores changes from another tab. Make it react (hint: a `board/replaced` action dispatched when `stored` changes from outside, careful about loops).
2. **Inline rename.** Double-click (or an "Edit" button) turns a card title into an input; Enter saves (`card/renamed` action), Escape cancels. Focus management matters: where does focus go afterwards?
3. **Undo.** Keep a history stack in the reducer state and add an "Undo" button. Notice how easy this is because state is immutable.
4. **Context.** Move the board API into a `BoardContext` with a `useBoardActions()` hook so `Card` doesn't need callbacks drilled through `Column`. Then write down whether it was worth it.
5. **Keyboard reordering** within a column (move up/down buttons), with tests.

## Done?

1. `npm test` is green and `npm run typecheck` is clean.
2. Commit on your branch `module/R1-react-fundamentals`, push and open a PR. CI runs this module's tests.
3. From the repo root: `npm run progress -- R1` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- R1-react-fundamentals/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
