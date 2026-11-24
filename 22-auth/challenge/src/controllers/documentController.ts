import type { Request, Response } from "express";
import { z } from "zod";
import type { Actor } from "../domain/actor.js";
import { parseInput } from "../lib/validate.js";
import { currentUser } from "../middleware/authenticate.js";
import type { DocumentService } from "../services/documentService.js";

const NewDocumentBody = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(50_000).default(""),
});

const PatchDocumentBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().max(50_000).optional(),
  })
  .refine((p) => p.title !== undefined || p.body !== undefined, "Provide title and/or body");

const actorOf = (res: Response): Actor => {
  const { id, role } = currentUser(res);
  return { id, role };
};

const idOf = (req: Request): string => String(req.params.id);

export function documentController(documents: DocumentService) {
  return {
    async create(req: Request, res: Response) {
      const input = parseInput(NewDocumentBody, req.body);
      const doc = await documents.create(actorOf(res), input);
      res.status(201).location(`/documents/${doc.id}`).json({ data: doc });
    },

    async list(_req: Request, res: Response) {
      res.json({ data: await documents.list(actorOf(res)) });
    },

    async get(req: Request, res: Response) {
      res.json({ data: await documents.get(actorOf(res), idOf(req)) });
    },

    async update(req: Request, res: Response) {
      const patch = parseInput(PatchDocumentBody, req.body);
      res.json({ data: await documents.update(actorOf(res), idOf(req), patch) });
    },

    async remove(req: Request, res: Response) {
      await documents.remove(actorOf(res), idOf(req));
      res.status(204).end();
    },
  };
}
