import type { Request, Response } from "express";
import { z } from "zod";
import { parseInput } from "../lib/validate.js";
import type { ProjectService } from "../services/projectService.js";

export const NewProjectBody = z.strictObject({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).default(""),
});

/** Shared by every list endpoint: ?limit=1..100 (default 20) and an opaque ?cursor=. */
export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(500).optional(),
});

export function projectController(projects: ProjectService) {
  return {
    async create(req: Request, res: Response) {
      const input = parseInput(NewProjectBody, req.body);
      const project = await projects.create(input);
      res.status(201).location(`/v1/projects/${project.id}`).json(project);
    },

    async list(req: Request, res: Response) {
      const query = parseInput(PageQuery, req.query, "Invalid query parameters");
      res.json(await projects.list(query));
    },

    async get(req: Request, res: Response) {
      res.json(await projects.get(String(req.params.projectId)));
    },
  };
}
