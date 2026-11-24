# React data cheat sheet (TanStack Query v5 + fetch + zod)

## fetch essentials

```ts
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json", "Idempotency-Key": key },
  body: JSON.stringify(data),
  signal,                       // AbortSignal for cancellation
});
res.ok          // true for 200–299. fetch does NOT reject on 4xx/5xx!
res.status      // 201, 404, ...
res.headers.get("content-type")
await res.json()                // throws if the body isn't JSON
// network failure / CORS block -> fetch rejects with TypeError
// abort                        -> rejects with DOMException name "AbortError"
```

## Setup

```tsx
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2 }, mutations: { retry: false } },
});
<QueryClientProvider client={queryClient}><App /></QueryClientProvider>
```

## Query keys

```ts
export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (projectId: string, filters?: object) => [...taskKeys.lists(), projectId, filters] as const,
  detail: (id: string) => [...taskKeys.all, "detail", id] as const,
};
```

## useQuery

```tsx
const q = useQuery({
  queryKey: taskKeys.detail(id),
  queryFn: ({ signal }) => api.get(id, signal),
  enabled: Boolean(id),        // don't run until we have an id
  staleTime: 60_000,
  select: (task) => task.title,
});
q.data  q.error  q.isPending  q.isError  q.isSuccess  q.isFetching  q.refetch()
```

## useInfiniteQuery (cursor pagination)

```tsx
const q = useInfiniteQuery({
  queryKey: taskKeys.list(projectId),
  queryFn: ({ pageParam, signal }) => api.list({ projectId, cursor: pageParam }, signal),
  initialPageParam: null as string | null,
  getNextPageParam: (last) => last.page.nextCursor ?? undefined,
  select: (data) => data.pages.flatMap((p) => p.data),
});
q.fetchNextPage()  q.hasNextPage  q.isFetchingNextPage  q.isFetchNextPageError
// cached shape: { pages: TaskPage[], pageParams: (string | null)[] }
```

## useMutation

```tsx
const qc = useQueryClient();
const m = useMutation({
  mutationFn: (vars: Vars) => api.create(vars),
  onMutate: async (vars) => { /* optimistic */ return { previous }; },
  onError: (err, vars, ctx) => { /* rollback */ },
  onSuccess: (data, vars, ctx) => { /* setQueryData from response */ },
  onSettled: () => qc.invalidateQueries({ queryKey: taskKeys.lists() }),
});
m.mutate(vars, { onSuccess: () => resetForm() });   // fire and forget, errors -> m.error
await m.mutateAsync(vars);                            // returns a promise, YOU catch errors
m.isPending  m.isError  m.error  m.variables  m.reset()
```

## Cache operations

```ts
qc.invalidateQueries({ queryKey: taskKeys.all });          // mark stale + refetch active (prefix match)
qc.invalidateQueries({ queryKey: taskKeys.list(p), exact: true });
qc.cancelQueries({ queryKey });                            // abort in-flight fetches
qc.getQueryData<T>(queryKey);
qc.setQueryData<T>(queryKey, (old) => (old ? next(old) : old));   // immutably!
qc.setQueriesData({ queryKey: taskKeys.lists() }, updater);       // many keys at once
qc.prefetchQuery({ queryKey, queryFn });                   // warm the cache (e.g. on hover)
qc.removeQueries({ queryKey });
```

## Optimistic update template

```ts
onMutate: async (vars) => {
  await qc.cancelQueries({ queryKey: key });
  const previous = qc.getQueryData<Data>(key);
  qc.setQueryData<Data>(key, (old) => (old ? applyOptimistic(old, vars) : old));
  return { previous };
},
onError: (_e, _v, ctx) => { if (ctx?.previous) qc.setQueryData(key, ctx.previous); },
onSettled: () => qc.invalidateQueries({ queryKey: key }),
```

## Immutable updates on infinite data

```ts
// replace one item
(old) => old && { ...old, pages: old.pages.map((p) => ({ ...p, data: p.data.map((t) => (t.id === u.id ? u : t)) })) }
// prepend to first page
(old) => { const [first, ...rest] = old.pages; return { ...old, pages: [{ ...first, data: [item, ...first.data] }, ...rest] }; }
// remove an item
(old) => old && { ...old, pages: old.pages.map((p) => ({ ...p, data: p.data.filter((t) => t.id !== id) })) }
```

## zod for forms and responses

```ts
const r = Schema.safeParse(input);
if (!r.success) {
  z.flattenError(r.error).fieldErrors;   // { title?: string[], ... }
  z.prettifyError(r.error);              // human-readable multi-line string
}
type In = z.input<typeof Schema>;   type Out = z.output<typeof Schema>;
z.url()  z.email()  z.enum([...])  z.string().trim().min(1)  .nullable()  .optional()  .default(x)
```

## Status → UI

| Query state | UI |
|---|---|
| `isPending` | skeleton / "Loading…" (`role="status"`) |
| `isError && !data` | message + Retry (`role="alert"`) |
| `data.length === 0` | empty state with next action |
| `isFetching && data` | keep data, subtle indicator |
| `isFetchNextPageError` | keep pages, error next to "Load more" |
| mutation `isPending` | disable + relabel button ("Adding…") |

## Testing

```tsx
const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
vi.stubGlobal("fetch", vi.fn(async (url, init) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
render(<QueryClientProvider client={qc}><TasksApiProvider api={api}><Ui /></TasksApiProvider></QueryClientProvider>);
expect(await screen.findByText("Loaded")).toBeInTheDocument();
afterEach(() => vi.unstubAllGlobals());
```
