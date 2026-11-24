import type { Request, Response } from "express";
import type { NoteService } from "../services/noteService.js";

export function noteController(service: NoteService) {
  return {
    async list(_req: Request, res: Response) {
      res.json({ data: await service.list() });
    },
    async create(req: Request, res: Response) {
      const note = await service.create(req.body);
      res.status(201).json({ data: note });
    },
    async get(req: Request, res: Response) {
      res.json({ data: await service.get(String(req.params.id)) });
    },
    async update(req: Request, res: Response) {
      res.json({ data: await service.update(String(req.params.id), req.body) });
    },
    async remove(req: Request, res: Response) {
      await service.delete(String(req.params.id));
      res.status(204).end();
    },
  };
}
