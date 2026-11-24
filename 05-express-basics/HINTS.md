# Hints · Express Basics

Open one hint at a time. Give each a real try before opening the next.

## TODO 1: Request ids

<details><summary>Hint 1</summary>

`req.get("x-request-id")` reads a header. A regex like `/^[A-Za-z0-9_-]{1,128}$/` checks validity.
</details>

<details><summary>Hint 2</summary>

`crypto.randomUUID()` (from `node:crypto`) generates an id. Store it with `res.locals.requestId = id` and send it back with `res.setHeader(...)`.
</details>

<details><summary>Hint 3</summary>

The shape is: read → validate → choose (incoming or new) → store on `res.locals` → set header → `next()`.
</details>

## TODO 2: Listing with `q` and `limit`

<details><summary>Hint 1</summary>

`req.query.limit` may be `undefined`, a string, or an array. Handle `undefined` (the default) first, then reject anything that isn't a string of digits.
</details>

<details><summary>Hint 2</summary>

`Number("2.5")` is `2.5` and `Number("")` is `0`, so a regex `/^\d+$/` check before converting avoids surprises. Then check the 1–100 range.
</details>

<details><summary>Hint 3</summary>

Filter with `.toLowerCase().includes(q)` on title OR body, then `.slice(0, limit)`. Throw `validationError(...)` for bad limits. Express 5 forwards it to the error handler.
</details>

## TODO 3 & 4: Single note + writes

<details><summary>Hint 1</summary>

Write small parsing functions: `parseTitle(value: unknown): string` that throws `validationError` when the input is wrong. Reuse them in POST and PATCH.
</details>

<details><summary>Hint 2</summary>

`store.update` and `store.get` return `undefined` for missing notes, and `store.delete` returns `false`. Turn those into `throw notFound("Note")`.
</details>

<details><summary>Hint 3</summary>

POST: `res.status(201).location(`/notes/${note.id}`).json({ data: note })`. DELETE: `res.status(204).end()`. For PATCH, build a `Partial<NewNote>` from only the fields that are `!== undefined`, and throw if it ends up empty.
</details>

## TODO 5: 404 for unknown routes

<details><summary>Hint 1</summary>

This middleware only runs when nothing else responded. You don't have to write the response here.
</details>

<details><summary>Hint 2</summary>

`next(new HttpError(404, "ROUTE_NOT_FOUND", `Cannot ${req.method} ${req.path}`))`
</details>

## TODO 6: Error handler

<details><summary>Hint 1</summary>

Use `instanceof HttpError` to detect expected errors. Everything else is unexpected.
</details>

<details><summary>Hint 2</summary>

The JSON parser's error has a `type` property equal to `"entity.parse.failed"`. `err` is typed loosely, so check carefully.
</details>

<details><summary>Hint 3</summary>

Start with "500 / INTERNAL_ERROR / Something went wrong" as the default, overwrite it for the two known cases, `console.error` only in the unknown case, then `res.status(status).json({ error: { code, message, requestId: res.locals.requestId } })`.
</details>
