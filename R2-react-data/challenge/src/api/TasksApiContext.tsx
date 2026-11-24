import { createContext, useContext, type ReactNode } from "react";
import type { TasksApi } from "./tasks";

/**
 * Dependency injection for the UI. main.tsx (the composition root) builds the
 * real TasksApi and provides it; tests provide one wired to a fake fetch.
 * Hooks get the API from here instead of importing a module-level singleton.
 *
 * This is the "sparingly" kind of context: it holds a dependency that never
 * changes after startup, so it never causes re-renders.
 */
const TasksApiContext = createContext<TasksApi | null>(null);

export function TasksApiProvider({ api, children }: { api: TasksApi; children: ReactNode }) {
  return <TasksApiContext value={api}>{children}</TasksApiContext>;
}

export function useTasksApi(): TasksApi {
  const api = useContext(TasksApiContext);
  if (!api) throw new Error("useTasksApi must be used inside <TasksApiProvider>");
  return api;
}
