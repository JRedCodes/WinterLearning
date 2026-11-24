# ES modules, CommonJS and TypeScript in Node

Module resolution is where TypeScript-in-Node trips people most. This page explains the moving parts so the errors make sense.

## Two module systems

| | CommonJS (CJS) | ES modules (ESM) |
|---|---|---|
| Syntax | `const x = require("./x")`, `module.exports = ...` | `import x from "./x.js"`, `export ...` |
| Loading | synchronous, at call time | asynchronous, parsed before running |
| File extension in imports | optional (`./x` finds `x.js`, `x/index.js`) | **required** (`./x.js`) |
| Top-level `await` | ❌ | ✅ |
| `__dirname`, `__filename` | ✅ | ❌, use `import.meta.dirname` / `import.meta.url` |
| Default in Node | `.js` files when package.json has no `"type"` (or `"type": "commonjs"`), and `.cjs` | `.js` files when package.json has `"type": "module"`, and `.mjs` |

Every project in this repo is ESM: `"type": "module"`.

## How TypeScript decides

With `"module": "NodeNext"` TypeScript doesn't pick a module system for you. It follows Node's rules per file:

- `.ts` in a package with `"type": "module"` → treated as ESM, compiled to ESM `.js`.
- `.ts` in a package without it → CJS.
- `.mts` → always ESM (emits `.mjs`). `.cts` → always CJS (emits `.cjs`).

That's why the `module` setting and package.json's `"type"` have to agree, and why `NodeNext` is the right choice for anything that runs on Node. (`"moduleResolution": "bundler"` is for frontend code processed by Vite/webpack, which have their own, looser rules.)

## The `.js` extension rule

```ts
// src/index.ts
import { groupBy } from "./groupBy.js";
```

TypeScript never rewrites import specifiers. After compiling, `dist/index.js` still says `"./groupBy.js"`, and Node needs that exact file. So you write the runtime path. During type checking, TypeScript sees `./groupBy.js`, notices there's a `./groupBy.ts`, and uses that.

Things that don't work:

- `"./groupBy"`: ESM in Node doesn't guess extensions. Error TS2835: *Relative import paths need explicit file extensions*.
- `"./groupBy.ts"`: refused unless you enable `allowImportingTsExtensions` (only allowed with `noEmit`), and then only tools that run `.ts` directly can execute the result.
- `"./utils"` meaning `./utils/index.js`: directory imports aren't supported in ESM. Write `"./utils/index.js"`.

Packages (`"express"`, `"pg"`) don't need extensions. Node resolves them through `node_modules` and their package.json `exports` field.

## `verbatimModuleSyntax`

Old TypeScript guessed which imports were type-only and dropped them. That guess requires looking at the *other* file, which single-file transpilers (esbuild in tsx and Vitest, swc, Node's own type stripping) can't do. With `verbatimModuleSyntax: true`:

- `import type { X } from "./x.js"` → removed entirely.
- `import { type X, y } from "./x.js"` → becomes `import { y } from "./x.js"`.
- `import { X } from "./x.js"` where X is only a type → **compile error** (TS1484), telling you to add `type`.

It also forbids `require`/`module.exports` in ESM files, which keeps things honest.

## Importing CommonJS from ESM

Most npm packages still ship CJS. From an ESM file you can usually `import pkg from "pkg"` (the default import is `module.exports`). Named imports (`import { Pool } from "pg"`) work only when Node can statically detect the export names, which is why you'll sometimes see this pattern in this repo:

```ts
import pg from "pg";
const { Pool } = pg;
```

## ESM-only conveniences

```ts
// directory of the current file (Node 20.11+)
const here = import.meta.dirname;
// or the portable version
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));

// top-level await
const config = await loadConfig();
```

## Running it

| Command | What happens |
|---|---|
| `npx tsx src/server.ts` | esbuild strips types in memory, Node runs the result. Fast, no checking. |
| `npx tsx watch src/server.ts` | same, restarts on file changes (`npm run dev` in every module) |
| `npx tsc` | type checks and writes `.js` to `outDir` (production builds) |
| `npx tsc --noEmit` | type checks only |
| `node --experimental-strip-types file.ts` | newer Node versions can strip simple types themselves; `enum` and `namespace` aren't supported because they need code generation |

## Quick diagnosis

| Error | Fix |
|---|---|
| TS2835 relative import needs extension | add `.js` |
| TS1484 X is a type and must be imported using a type-only import | `import type { X }` or `import { type X }` |
| `ERR_MODULE_NOT_FOUND` at runtime | wrong path or missing `.js`; check the compiled path, not the source path |
| `ReferenceError: require is not defined in ES module scope` | you're in ESM: use `import` |
| `__dirname is not defined` | use `import.meta.dirname` |
| `SyntaxError: Named export 'X' not found` from a CJS package | default-import the package and destructure |
