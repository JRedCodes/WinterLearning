import { Router } from "express";
import { noteController } from "../controllers/noteController.js";
import type { NoteService } from "../services/noteService.js";

export function notesRouter(service: NoteService): Router {
  const c = noteController(service);
  const router = Router();
  router.get("/", c.list);
  router.post("/", c.create);
  router.get("/:id", c.get);
  router.patch("/:id", c.update);
  router.delete("/:id", c.remove);
  return router;
}
