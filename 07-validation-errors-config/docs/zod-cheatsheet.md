# zod 4 cheat sheet

```ts
import { z } from "zod";
```

## Primitives & common checks

```ts
z.string().min(1).max(120).trim().toLowerCase().toUpperCase()
z.string().regex(/^[A-Z0-9-]+$/, "custom message")
z.email()   z.url()   z.uuid()   z.iso.datetime()      // zod 4: top-level string formats
z.number().int().min(0).max(100).positive().nonnegative()
z.boolean()
z.literal("admin")
z.enum(["asc", "desc"])
z.date()                       // a Date object (not a string)
z.unknown()  z.any()  z.never()
```

## Objects, arrays, unions

```ts
z.object({ a: z.string(), b: z.number().optional() })   // unknown keys stripped
z.strictObject({ … })          // unknown keys → error
z.looseObject({ … })           // unknown keys kept
Schema.partial()               // all keys optional
Schema.pick({ a: true })  Schema.omit({ b: true })  Schema.extend({ c: z.string() })

z.array(z.string()).min(1).max(10)
z.tuple([z.string(), z.number()])
z.union([z.string(), z.number()])
z.discriminatedUnion("type", [
  z.object({ type: z.literal("card"), last4: z.string() }),
  z.object({ type: z.literal("iban"), iban: z.string() }),
])
z.record(z.string(), z.number())
```

## Optional, nullable, defaults

```ts
z.string().optional()          // string | undefined
z.string().nullable()          // string | null
z.string().nullish()           // string | null | undefined
z.number().default(20)         // undefined → 20 (output type: number)
z.array(z.string()).default([])
```

## Coercion (only for strings from URLs, headers, env)

```ts
z.coerce.number()              // Number(input)   "" → 0, null → 0, "abc" → NaN → error
z.coerce.date()                // new Date(input)
z.stringbool()                 // "true"/"1"/"yes"/"on" → true, "false"/"0"/"no"/"off" → false, else error
// ❌ z.coerce.boolean()       // Boolean("false") === true
```

## Transforms & refinements

```ts
z.string().transform((s) => s.split(","))         // changes the output type
z.object({...}).refine((v) => v.min <= v.max, { message: "…", path: ["min"] })
z.object({...}).superRefine((v, ctx) => {
  if (bad) ctx.addIssue({ code: "custom", path: ["field"], message: "…" });
})
z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().optional())
```

Refinements on an object are skipped when a field already has a type-level error.

## Parsing

```ts
Schema.parse(data)             // value or throws ZodError
const r = Schema.safeParse(data)
r.success ? r.data : r.error.issues   // issues: { code, path: (string|number)[], message }[]
await Schema.parseAsync(data)  // needed if any refine/transform is async
z.prettifyError(r.error)       // human-readable multi-line string
z.flattenError(r.error)        // { formErrors: string[], fieldErrors: { field: string[] } }
```

## Types

```ts
type Out = z.infer<typeof Schema>   // after defaults/transforms (what you get)
type In  = z.input<typeof Schema>   // before (what callers may send)
const S = z.object({ … }) satisfies z.ZodType<MyServiceInput>   // prove output matches a type you own
```

## Recipes

```ts
// Pagination query
const Page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Comma-separated list in a query string: ?tags=a,b,c
const Tags = z.string().transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean));

// PATCH body: at least one field
const Patch = Base.partial().refine((p) => Object.values(p).some((v) => v !== undefined), {
  message: "provide at least one field to update",
});

// Money as integer cents (never floats)
const Cents = z.number().int().min(0);

// Env var that may be set to the empty string
const OptionalInt = z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().optional());
```
