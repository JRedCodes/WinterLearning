# Challenge · Port `utils.js` to strict TypeScript

**Type:** 🧩 Scaffold · **Est:** 3–4h · **Services:** none

## Scenario

> **#platform** · *Marcus (staff engineer):* We're finally killing the old `utils.js` package. Half our incidents last quarter traced back to it: `first(list).name` on empty lists, an invoice that showed `NaN` because nobody updated `area()` for triangles, and a config loader that happily accepted `port: "8080"`. I've put the original JS in `legacy/` and stubbed the TypeScript versions in `src/`. The bar: strict mode, **zero `any`**, and the types should make each of those incidents impossible to write. There are runtime tests *and* type-level tests. Both have to pass.

## Your task

Work through the numbered `TODO(n)` comments in `challenge/src/`. Each one says which legacy file to port and exactly what the types should look like.

| TODO | File | Concepts |
|---|---|---|
| 1 | `first.ts` | overloads, tuples vs arrays, `noUncheckedIndexedAccess` |
| 2 | `groupBy.ts` | generics, `extends PropertyKey`, `Partial<Record<K, T[]>>` |
| 3 | `pick.ts` | `keyof`, `K extends keyof T`, `Pick<T, K>` |
| 4 | `shapes.ts` | discriminated union, exhaustive `switch`, `assertNever(never)` |
| 5 | `result.ts` + `parseConfig.ts` | `Result<T, E>`, `unknown` narrowing, type predicates, `as const` |
| 6 | `eventBus.ts` | generic class, `Events[K]` indexed access, mapped-type storage |
| 7 | `deepFreeze.ts` | generic signature over a given `DeepReadonly<T>`, recursion on `unknown`, cycles |

Suggested order: 1 → 2 → 3 → 4 → 5 → 7 → 6. The event bus is the hardest.

How the tests work:

- `test/*.test.ts` are normal runtime tests (Vitest).
- `test/types/*.test-d.ts` are **type-level tests**. They never run. They use `expectTypeOf(...)` and `// @ts-expect-error` and only pass if the compiler accepts them.
- `test/typecheck.test.ts` runs `tsc --noEmit` over everything, so any type error, in `src/` or in the type tests, fails `npm test`.
- `test/strictness.test.ts` fails if `src/` contains `any`, `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`, or `as unknown as`, or if `tsconfig.json` loses `strict`/`noUncheckedIndexedAccess`.

## Acceptance criteria

- [ ] `first` returns `T` for non-empty tuples and `T | undefined` for arrays, and accepts readonly input (TODO 1).
- [ ] `groupBy` infers item and key types, returns `Partial<Record<K, T[]>>`, rejects non-key return values, keeps input order (TODO 2).
- [ ] `pick` rejects unknown keys at compile time and returns exactly `Pick<T, K>` (TODO 3).
- [ ] `Shape` is a union of `Circle | Rectangle | Triangle` discriminated by `kind`; `area` handles all three; `assertNever` accepts only `never` and throws at runtime (TODO 4).
- [ ] `Result<T, E>` narrows on `ok`; `ok()`/`err()` build both variants (TODO 5).
- [ ] `LogLevel` is derived from `LOG_LEVELS` with `as const`; `isLogLevel` is a type predicate (TODO 5).
- [ ] `parseConfig(unknown)` returns a typed, readonly `AppConfig` with defaults, or **all** errors with paths like `features[2]` (TODO 5).
- [ ] `EventBus<Events>` type-checks event names and payloads; `on`/`once` return unsubscribe functions; `emit` iterates a copy; `listenerCount` works (TODO 6).
- [ ] `deepFreeze` freezes every level, returns the same reference typed `DeepReadonly<T>`, and survives cycles (TODO 7).
- [ ] No `any`, no compiler-silencing comments, strict config intact.
- [ ] `npm test` (which includes the type check) passes.

## Getting started

```bash
cd 02-typescript-fundamentals/challenge
make install
make test          # everything fails at first, including the type check
npm run typecheck  # just the compiler output, easier to read while you work
make dev           # re-runs src/playground.ts on save, for experiments
```

The type-check test prints the first 40 compiler errors. While working on one TODO, filter: `npx tsc --noEmit | grep groupBy`. Run one runtime test file with `npx vitest run test/groupBy.test.ts`.

Expect the error count to drop in jumps: fixing one signature often clears a dozen errors in the tests that call it.

## Rules

- Don't modify anything in `test/` or `tsconfig.json`.
- No `any`. Not as an annotation, not as `as any`, not as `any[]`.
- No `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck` in `src/`, and no `as unknown as X`.
- A single, narrow `as` assertion is acceptable where TypeScript can't follow your reasoning (two places in this challenge are natural candidates), but **leave a comment saying why it's safe**. If you can avoid it, even better.
- No dependencies beyond what's in `package.json`.

## Stretch goals

1. Add a `countBy(items, keyFn)` that returns `Partial<Record<K, number>>`, with your own runtime and type tests.
2. Give `EventBus` an `onAny(handler)` whose handler receives a discriminated union `{ [K in keyof Events]: { event: K; payload: Events[K] } }[keyof Events]`. Write a type test showing that narrowing on `event` narrows `payload`.
3. Make `parseConfig` also reject unknown keys (a typo like `logLevle` should be an error, not silently ignored). Is that the right default for config files? Write down your reasoning.
4. Experiment: delete the `triangle` case from `area` and read the error. Then also delete the `default` branch: you get TS2366 ("lacks ending return statement") instead, because the declared `number` return type saves you here. Now change the return type to `number | undefined` and the safety net is gone. Explain in two sentences why `assertNever` is more robust than relying on the return type.

## Done?

1. `npm test` is green (that includes `tsc --noEmit`).
2. Commit on your branch `module/02-typescript-fundamentals`, push and open a PR. CI runs this module's tests. Ask Claude to review the PR if you want feedback.
3. From the repo root: `npm run progress -- 02` to tick it off on the roadmap.
4. Answer the questions in [INTERVIEW.md](INTERVIEW.md).
5. Add an entry to [LOG.md](../LOG.md).
6. Compare with the reference solution: `git diff main origin/solutions -- 02-typescript-fundamentals/` (and read `SOLUTION.md` on that branch).

Stuck? → [HINTS.md](HINTS.md)
