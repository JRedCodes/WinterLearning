import type { RequestHandler } from "express";
import type { TaskService } from "../services/taskService.js";
import type { TaskPatch } from "../domain/task.js";
import {
  CreateProjectBody,
  CreateTaskBody,
  IdParams,
  ListTasksQuery,
  MoveTasksBody,
  ProjectTaskParams,
  UpdateTaskBody,
} from "./schemas.js";

/**
 * Thin controllers: parse input → call the service → shape the response.
 * Zod errors and domain errors are thrown and handled by errorHandler.
 */
export function createTaskController(service: TaskService) {
  const createProject: RequestHandler = async (req, res) => {
    const { name } = CreateProjectBody.parse(req.body);
    const project = await service.createProject(name);
    res.status(201).location(`/projects/${project.id}`).json({ data: project });
  };

  const getProject: RequestHandler = async (req, res) => {
    const { id } = IdParams.parse(req.params);
    res.json({ data: await service.getProject(id) });
  };

  const createTask: RequestHandler = async (req, res) => {
    const { projectId } = ProjectTaskParams.parse(req.params);
    const body = CreateTaskBody.parse(req.body);
    const task = await service.createTask({ projectId, ...body });
    res.status(201).location(`/tasks/${task.id}`).json({ data: task });
  };

  const listTasks: RequestHandler = async (req, res) => {
    const filter = ListTasksQuery.parse(req.query);
    res.json({ data: await service.listTasks(filter) });
  };

  const getTask: RequestHandler = async (req, res) => {
    const { id } = IdParams.parse(req.params);
    res.json({ data: await service.getTask(id) });
  };

  const updateTask: RequestHandler = async (req, res) => {
    const { id } = IdParams.parse(req.params);
    const patch: TaskPatch = UpdateTaskBody.parse(req.body);
    res.json({ data: await service.updateTask(id, patch) });
  };

  const deleteTask: RequestHandler = async (req, res) => {
    const { id } = IdParams.parse(req.params);
    await service.deleteTask(id);
    res.status(204).end();
  };

  const moveTasks: RequestHandler = async (req, res) => {
    const { taskIds, toProjectId } = MoveTasksBody.parse(req.body);
    const moved = await service.moveTasks(taskIds, toProjectId);
    res.json({ data: moved });
  };

  return { createProject, getProject, createTask, listTasks, getTask, updateTask, deleteTask, moveTasks };
}

export type TaskController = ReturnType<typeof createTaskController>;
