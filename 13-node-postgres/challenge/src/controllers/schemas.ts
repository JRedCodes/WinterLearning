import { z } from "zod";
import { TASK_STATUSES } from "../domain/task.js";

/**
 * Request schemas: the trust boundary. Anything past the controller is
 * typed and validated. (Module 07 covers this pattern in depth.)
 */

// bigint ids travel as strings of digits. Rejecting anything else here means
// Postgres never sees `WHERE id = 'abc'` (which would be a 500, not a 404).
export const IdSchema = z.string().regex(/^[1-9]\d{0,17}$/, "must be a positive integer id");

const DateOnly = z.iso.date(); // "YYYY-MM-DD"

export const IdParams = z.object({ id: IdSchema });
export const ProjectTaskParams = z.object({ projectId: IdSchema });

export const CreateProjectBody = z.object({
  name: z.string().trim().min(1).max(100),
});

export const CreateTaskBody = z.object({
  title: z.string().trim().min(1).max(200),
  status: z.enum(TASK_STATUSES).optional(),
  estimateHours: z.number().min(0).max(9999.99).nullable().optional(),
  dueDate: DateOnly.nullable().optional(),
});

export const UpdateTaskBody = CreateTaskBody.partial()
  .extend({ projectId: IdSchema.optional() })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: "provide at least one field to update",
  });

export const ListTasksQuery = z.object({
  projectId: IdSchema.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const MoveTasksBody = z.object({
  taskIds: z.array(IdSchema).min(1).max(100),
  toProjectId: IdSchema,
});
