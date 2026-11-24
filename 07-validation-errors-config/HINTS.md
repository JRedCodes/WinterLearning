# Hints · Validation, Errors & Config

Open one hint at a time. Give each a real try before opening the next.

## TODO 4: Domain errors

<details><summary>Hint 1</summary>

The categories (`NotFoundError`, `ConflictError`, `BusinessRuleError`) already exist above the TODO. Your classes just need to extend the right one instead of `Error`.
</details>

<details><summary>Hint 2</summary>

`AppError` declares `abstract readonly code: string`, so each subclass must define it: `readonly code = "PRODUCT_NOT_FOUND";`. Pass the message to `super(...)`.
</details>

## TODO 5: Service errors

<details><summary>Hint 1</summary>

`get()` is used by `update()` and `reserve()`, so fixing it once fixes all three.
</details>

<details><summary>Hint 2</summary>

The repository has `findBySku`. Check it **before** inserting. For `reserve`, compare `product.stock` with `quantity` before computing anything, and `delete()` already tells you whether something was deleted.
</details>

## TODO 6: Error handler

<details><summary>Hint 1</summary>

Start from the safe default (500 / `INTERNAL_ERROR` / "Something went wrong"), then specialize: `err instanceof AppError`, then the JSON parse error, otherwise log.
</details>

<details><summary>Hint 2</summary>

A small table of `[CategoryClass, status]` pairs plus `.find(([C]) => err instanceof C)` maps categories without a long `if` chain. Only `ValidationError` gets `details`.
</details>

<details><summary>Hint 3</summary>

The test checks `logger.calls` for `level === "error"` with `meta` containing `{ err, method, path }`. Use `req.originalUrl` for the path. For expected errors, `logger.debug(...)` or nothing at all.
</details>

## TODO 2: Schemas

<details><summary>Hint 1</summary>

Order matters in zod chains: `z.string().trim().toUpperCase().regex(...)` checks the regex against the normalized value. Build small reusable field schemas (`sku`, `name`, `priceCents`...) and use them in both create and update.
</details>

<details><summary>Hint 2</summary>

- Query numbers: `z.coerce.number().int().min(1).default(1)`.
- Query boolean: `z.stringbool().optional()`.
- "At least one field" for PATCH: `.refine((p) => Object.values(p).some((v) => v !== undefined), { message: "…" })`.
- `sku` and `stock` disappear from the PATCH output if you simply don't list them: `z.object` strips unknown keys.
</details>

<details><summary>Hint 3</summary>

Replace the `z.ZodType<…> = z.any()` annotations with `satisfies`:

```ts
export const reserveSchema = z.object({ quantity: z.number().int().min(1).max(1000) })
  satisfies z.ZodType<{ quantity: number }>;
```

For the min/max price rule: `.refine(q => q.minPriceCents === undefined || q.maxPriceCents === undefined || q.minPriceCents <= q.maxPriceCents, { message: "…", path: ["minPriceCents"] })`.
</details>

## TODO 3: validate()

<details><summary>Hint 1</summary>

Loop over `["params", "query", "body"]`. For each part that has a schema, `safeParse(req[part])`. Keep going even after a failure.
</details>

<details><summary>Hint 2</summary>

Each zod issue has `path: (string | number | symbol)[]`. `[part, ...issue.path.map(String)].join(".")` gives `"body.items.1.qty"`, and an empty issue path gives just `"body"`.
</details>

<details><summary>Hint 3</summary>

At the end: if you collected any details, `return next(new ValidationError(details))`. Otherwise `res.locals.validated = validated; next();`.
</details>

## TODO 1: Config

<details><summary>Hint 1</summary>

Write one `z.object({...})` with a field per env var. Env values are strings, so numbers need `z.coerce.number()`. Leave `LOG_LEVEL` optional in the schema and fill in the per-environment default *after* parsing, when you know `NODE_ENV`.
</details>

<details><summary>Hint 2</summary>

Remove empty strings before parsing: `Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""))`. For cross-field rules use `.superRefine((env, ctx) => ctx.addIssue({ code: "custom", path: ["API_KEY"], message: "…" }))`.
</details>

<details><summary>Hint 3</summary>

```ts
const result = EnvSchema.safeParse(withoutEmpty(env));
if (!result.success) throw new ConfigError(result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`));
// then map result.data (NODE_ENV, PORT, …) onto the Config shape
```
</details>
