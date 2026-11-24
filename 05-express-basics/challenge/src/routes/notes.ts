import { Router } from "express";
import type { NoteStore } from "../lib/noteStore.js";

/**
 * Notes routes, mounted at /notes in app.ts.
 *
 * Success bodies are wrapped: { "data": ... }
 * Errors are thrown as HttpError (see ../lib/httpError.ts) and formatted
 * by the error handler. Express 5 forwards rejected promises from async
 * handlers to the error handler for you, so `throw` works inside them.
 */
export function notesRouter(store: NoteStore): Router {
  const router = Router();

  // GET /notes: list notes.
  // TODO(2): support `?q=` (case-insensitive match on title OR body) and
  // `?limit=` (integer 1–100, default 20; anything else -> 400 VALIDATION_ERROR).
  router.get("/", async (_req, res) => {
    const notes = await store.list();
    res.json({ data: notes });
  });

  // TODO(3): GET /notes/:id -> 200 { data: note } or 404 NOT_FOUND ("Note not found")

  // TODO(4): write routes
  //  POST   /notes      -> 201 { data: note } + Location: /notes/<id>
  //                        title: required string, 1–100 chars after trimming
  //                        body:  optional string (default ""), max 5000 chars
  //  PATCH  /notes/:id  -> 200 { data: note }. Same rules, but every field is optional;
  //                        at least one of title/body must be present.
  //  DELETE /notes/:id  -> 204 with no body
  //  Invalid input -> 400 VALIDATION_ERROR. Missing note -> 404 NOT_FOUND.

  return router;
}
