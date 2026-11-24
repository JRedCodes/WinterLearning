# React cheat sheet (React 19 + TypeScript)

## Components & props

```tsx
interface Props {
  title: string;
  count?: number;                      // optional
  onSelect: (id: string) => void;      // callback = events up
  children?: React.ReactNode;          // anything renderable
}

export function Thing({ title, count = 0, onSelect, children }: Props) {
  return (
    <>
      <h2>{title}</h2>
      {count > 0 && <span>{count}</span>}
      {children}
    </>
  );
}
```

## JSX gotchas

```tsx
className="x"   htmlFor="id"   style={{ marginTop: 8 }}   aria-label="..."   data-id="..."
{cond && <X />}            // careful: {0 && <X />} renders "0"
{cond ? <A /> : <B />}
{list.map((x) => <Item key={x.id} {...x} />)}   // stable unique key
onClick={handle}  onClick={() => handle(id)}    // NOT onClick={handle()}
<button type="button">                          // inside forms, default is submit
```

## State

```tsx
const [value, setValue] = useState(initial);
const [data, setData] = useState(() => expensiveInit());   // lazy init, runs once
setValue(next);
setValue((prev) => prev + 1);                               // when next depends on prev

// immutable updates
setList([...list, item]);                                   // add
setList(list.filter((x) => x.id !== id));                   // remove
setList(list.map((x) => (x.id === id ? { ...x, done: true } : x)));  // update
setObj({ ...obj, name: "new" });
setList([...list].sort(byDate));                            // sort a COPY (or list.toSorted(byDate))
```

## Reducer

```tsx
type Action = { type: "added"; item: Item } | { type: "removed"; id: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "added":   return { ...state, items: [...state.items, action.item] };
    case "removed": return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    default: { const never: never = action; return never; }
  }
}
const [state, dispatch] = useReducer(reducer, initialState);
dispatch({ type: "removed", id });
```

## Effects

```tsx
useEffect(() => {
  // setup: subscribe / start
  return () => { /* cleanup: unsubscribe / stop */ };
}, [dep1, dep2]);   // every reactive value the effect reads
```

| Need | Use |
|---|---|
| value computed from props/state | plain expression during render |
| respond to click/submit | event handler |
| reset state when prop changes | `key={prop}` on the component |
| subscribe to browser API / socket / timer | `useEffect` + cleanup |
| measure DOM before paint | `useLayoutEffect` |
| fetch server data | TanStack Query (R2) |

## Refs

```tsx
const inputRef = useRef<HTMLInputElement>(null);
<input ref={inputRef} />
inputRef.current?.focus();      // in handlers/effects, not during render

const timer = useRef<number | undefined>(undefined);   // mutable box, no re-render
```

## Context

```tsx
const UserContext = createContext<User | null>(null);
<UserContext value={user}>{children}</UserContext>        // React 19 (was .Provider)
const user = useContext(UserContext);

// custom hook with a helpful error
function useUser() {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser must be used inside <UserContext>");
  return user;
}
```

## Forms

```tsx
// controlled
const [title, setTitle] = useState("");
<form onSubmit={(e) => { e.preventDefault(); onAdd(title.trim()); setTitle(""); }}>
  <label htmlFor={id}>Title</label>
  <input id={id} value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!error || undefined} />
  {error && <p role="alert">{error}</p>}
  <button type="submit">Add</button>
</form>

// uncontrolled + React 19 action
<form action={async (formData) => { await save(formData.get("title")); }}>
  <input name="title" defaultValue="" />
  <SubmitButton />   {/* uses useFormStatus() to show pending */}
</form>
```

## Other hooks

```tsx
const id = useId();                                 // stable unique id for label/aria wiring
const sorted = useMemo(() => sort(rows), [rows]);   // cache expensive computation
const onPick = useCallback((id) => pick(id), []);   // stable function identity
const [optimistic, addOptimistic] = useOptimistic(state, merge);   // React 19
const [state, formAction, isPending] = useActionState(action, initial);   // React 19
const value = use(promiseOrContext);                // React 19, with Suspense
```

## Testing Library

```tsx
render(<App />);
const user = userEvent.setup();

screen.getByRole("button", { name: "Save" });       // throws if missing
screen.queryByRole("alert");                         // null if missing (assert absence)
await screen.findByText("Loaded");                   // waits
within(screen.getByRole("region", { name: "Done" })).getAllByRole("listitem");
screen.getByLabelText("Email");

await user.click(el);  await user.type(el, "hi{Enter}");  await user.clear(el);
await user.keyboard("{Escape}");  await user.tab();  await user.paste("text");

expect(el).toBeInTheDocument();   expect(el).toHaveValue("x");   expect(el).toHaveTextContent("x");
expect(el).toHaveAttribute("aria-invalid", "true");   expect(el).toBeDisabled();
expect(el).toBeEmptyDOMElement();   expect(fn).toHaveBeenCalledWith("arg");

const { result } = renderHook(() => useThing());
act(() => result.current.doIt());
```
