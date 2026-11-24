import { z } from "zod";

/**
 * The API contract, as zod schemas. These mirror module 23's tasks API.
 * In a monorepo you'd import the SAME schemas from a shared package in both
 * the backend (to validate requests) and the frontend (to validate forms and
 * responses), so the two can't drift apart.
 */

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export const TaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Increments on every change. Sent back as `If-Match: "<version>"` when updating. */
  version: z.number().int(),
});
export type Task = z.infer<typeof TaskSchema>;

/** Every list endpoint returns this envelope. `nextCursor: null` = last page. */
export const TaskPageSchema = z.object({
  data: z.array(TaskSchema),
  page: z.object({
    limit: z.number().int(),
    nextCursor: z.string().nullable(),
  }),
});
export type TaskPage = z.infer<typeof TaskPageSchema>;

/** Body of POST /v1/projects/:projectId/tasks. Also validates the "new task" form. */
export const NewTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be 200 characters or fewer"),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must look like YYYY-MM-DD")
    .nullable(),
});
/** What the form gives the schema (before trimming etc.). */
export type NewTaskInput = z.input<typeof NewTaskSchema>;
/** What the schema gives back: validated and normalized. Send this to the API. */
export type NewTask = z.output<typeof NewTaskSchema>;

/** Body of PATCH /v1/tasks/:taskId (merge-patch: absent fields stay unchanged). */
export type TaskPatch = Partial<Pick<Task, "title" | "status" | "priority" | "dueDate">>;

/** RFC 9457 Problem Details, the error body module 23's API returns. */
export const ProblemSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.number().optional(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z.array(z.object({ pointer: z.string(), detail: z.string() })).optional(),
});
export type Problem = z.infer<typeof ProblemSchema>;
