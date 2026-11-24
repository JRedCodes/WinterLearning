import type { Request, Response } from "express";
import { z } from "zod";
import { TASK_PRIORITIES, TASK_SORTS, TASK_STATUSES } from "../domain/task.js";
import { etagFor } from "../lib/etag.js";
import { parseInput } from "../lib/validate.js";
import type { TaskService } from "../services/taskService.js";
import { PageQuery } from "./projectController.js";

const isoDate = z.iso.date(); // "YYYY-MM-DD"

export const NewTaskBody = z.strictObject({
  title: z.string().trim().min(1).max(200),
  status: z.enum(TASK_STATUSES).default("todo"),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  dueDate: isoDate.nullable().default(null),
});

/** JSON Merge Patch (RFC 7396): only the fields present change; dueDate: null clears it. */
export const TaskPatchBody = z
  .strictObject({
    title: z.string().trim().min(1).max(200).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueDate: isoDate.nullable().optional(),
  })
  .refine((p) => Object.keys(p).length > 0, "Provide at least one field to change");

export const TaskListQueryParams = PageQuery.extend({
  status: z.enum(TASK_STATUSES).optional(),
  sort: z.enum(TASK_SORTS).default("createdAt"),
});

const taskId = (req: Request) => String(req.params.taskId);

export function taskController(tasks: TaskService) {
  return {
    async create(req: Request, res: Response) {
      const input = parseInput(NewTaskBody, req.body);
      const task = await tasks.create(String(req.params.projectId), input);
      res.status(201).location(`/v1/tasks/${task.id}`).setHeader("ETag", etagFor(task.version)).json(task);
    },

    async remove(req: Request, res: Response) {
      await tasks.remove(taskId(req));
      res.status(204).end();
    },

    /** TODO(5b): GET /v1/projects/:projectId/tasks -> 200 Page<Task>. Parse req.query with TaskListQueryParams. */
    async list(_req: Request, _res: Response) {
      throw new Error("Not implemented: TODO(5b) taskController.list");
    },

    /**
     * TODO(5b): GET /v1/tasks/:taskId
     *   - always set the ETag header
     *   - If-None-Match hits the current version -> 304 with no body
     *   - otherwise 200 with the task
     */
    async get(_req: Request, _res: Response) {
      throw new Error("Not implemented: TODO(5b) taskController.get");
    },

    /**
     * TODO(5b): PATCH /v1/tasks/:taskId
     *   - parse the body with TaskPatchBody (400 on problems)
     *   - parse If-Match; absent -> throw PreconditionRequiredError (428)
     *   - call tasks.update(...) (412 / 404 come from the service)
     *   - 200 with the updated task and its NEW ETag
     *   Order matters: a request that is BOTH invalid and missing If-Match gets
     *   the 428 (check the precondition first, it's cheaper and tells the client
     *   how to fix its request flow).
     */
    async update(_req: Request, _res: Response) {
      throw new Error("Not implemented: TODO(5b) taskController.update");
    },
  };
}
