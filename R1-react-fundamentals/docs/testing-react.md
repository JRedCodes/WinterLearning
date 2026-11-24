# Deep dive · Testing React with Vitest + Testing Library

This is the setup used in every React challenge in this repo. You already know Vitest from the backend modules ([09 · Testing](../../09-testing/README.md)). Here's what's different for UI code.

## The stack

| Piece | Job |
|---|---|
| **Vitest** | test runner, assertions, mocks (`vi.fn`, `vi.spyOn`) |
| **jsdom** | a DOM implemented in JavaScript, so `document` exists in Node (`test.environment: "jsdom"`) |
| **@testing-library/react** | `render`, `screen`, `within`, `renderHook`, `act` |
| **@testing-library/user-event** | realistic user interactions (typing, clicking, tabbing) |
| **@testing-library/jest-dom** | DOM matchers: `toBeInTheDocument`, `toHaveValue`, `toHaveAttribute`, `toBeDisabled`... |

`test/setup.ts` runs before every test file. It registers the jest-dom matchers and unmounts everything after each test (`cleanup()`), plus clears `localStorage` so tests can't leak state into each other.

## Anatomy of a component test

```tsx
it("submits the trimmed title", async () => {
  // Arrange: render with fake callbacks
  const onAdd = vi.fn();
  const user = userEvent.setup();
  render(<AddCardForm onAdd={onAdd} />);

  // Act: do what a user does
  await user.type(screen.getByLabelText("New card title"), "  Plan sprint  ");
  await user.click(screen.getByRole("button", { name: "Add card" }));

  // Assert: what the user sees, and what the component told its parent
  expect(onAdd).toHaveBeenCalledWith("Plan sprint");
  expect(screen.getByLabelText("New card title")).toHaveValue("");
});
```

Callbacks as `vi.fn()` are the frontend version of injecting a fake repository: the component's contract with its parent is "I call `onAdd` with a trimmed title", and that's exactly what you assert.

## Roles and accessible names

`getByRole` is the workhorse. The role comes from the element (implicit ARIA role) and the **accessible name** comes from its label, content or `aria-label`/`aria-labelledby`.

| Markup | Role | Accessible name |
|---|---|---|
| `<button>Save</button>` | `button` | "Save" |
| `<button aria-label="Delete Buy milk">Delete</button>` | `button` | "Delete Buy milk" |
| `<label>Email <input /></label>` | `textbox` | "Email" |
| `<input type="search" aria-label="Filter" />` | `searchbox` | "Filter" |
| `<input type="checkbox" />` + label | `checkbox` | label text |
| `<h2>Done</h2>` | `heading` (level 2) | "Done" |
| `<section aria-labelledby="h">` + `<h2 id="h">Done</h2>` | `region` | "Done" |
| `<section>` with no name | none (generic) | |
| `<article aria-labelledby="t">` | `article` | text of `#t` |
| `<ul>` / `<li>` | `list` / `listitem` | |
| `<p role="alert">` | `alert` | |
| `<p role="status">` | `status` | |
| `<a href="/x">Docs</a>` | `link` | "Docs" |

Note that a `<section>` only becomes a `region` landmark when it has an accessible name. That's why the challenge columns use `aria-labelledby`.

When you're unsure what's on the page, `screen.debug()` prints the DOM, and `screen.logTestingPlaygroundURL()` gives you a link that suggests queries. A failing `getByRole` also prints every role it could find, which is often the fastest way to see your mistake.

### Scoping with `within`

Several columns each have a "No cards" text. Scope the query to one region:

```tsx
const done = screen.getByRole("region", { name: "Done" });
expect(within(done).getByText("No cards")).toBeInTheDocument();
```

## Async: `findBy`, `waitFor`, and `act`

- `await screen.findByText("Saved")` retries until the element appears (default timeout 1s). Use it for anything that happens after a promise resolves.
- `await waitFor(() => expect(spy).toHaveBeenCalled())` retries an arbitrary assertion. Keep a single assertion inside; side effects inside `waitFor` run repeatedly.
- `act(...)` flushes React updates and effects. `render`, `user-event` and `findBy` already wrap things in `act` for you. You need it explicitly mostly when *you* trigger an update outside React, such as dispatching a `StorageEvent` on `window` or calling a hook's setter from `renderHook`.

The warning *"An update to X inside a test was not wrapped in act(...)"* means something updated state after your test stopped watching, usually an un-awaited promise. Await the user-event call or use `findBy`.

## Testing hooks with `renderHook`

```tsx
const { result, rerender, unmount } = renderHook(() => useLocalStorage("k", 0));
act(() => result.current[1](5));
expect(result.current[0]).toBe(5);
```

`result.current` always holds the latest return value. Use `renderHook` for hooks with real logic. If a hook is a thin wrapper, testing it through a component is often clearer.

## Spying on browser APIs

```tsx
const add = vi.spyOn(window, "addEventListener");
// ...
add.mockRestore(); // always restore, or later tests see the spy
```

`vi.spyOn(Storage.prototype, "getItem")` works for localStorage because jsdom's `localStorage` is a `Storage` instance.

## What not to test

- Internal state values, or which hooks a component uses.
- How many times a component rendered.
- CSS classes, unless the class *is* the behavior (and then prefer an attribute like `aria-pressed` or `aria-current`).
- Third-party libraries themselves.

If a refactor that doesn't change behavior breaks your tests, they were testing implementation.

## Pure logic first

The fastest, most valuable tests in a React codebase usually aren't component tests at all. Reducers, validators, formatters and filters are pure functions: test them with plain `expect`, many cases, no DOM. Then a handful of component tests check the wiring, and one or two integration tests (`render(<App />)`) check that the whole thing works together. Same pyramid as the backend.
