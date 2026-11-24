import { useMutation } from "@tanstack/react-query";
import { useTasksApi } from "../api/TasksApiContext";
import type { Task, TaskPatch } from "../schemas/task";

export interface UpdateTaskVariables {
  task: Task;
  patch: TaskPatch;
}

/**
 * TODO(5): update a task (not optimistic).
 *
 *  mutationFn: api.update(task, patch)
 *  onSuccess:  the server returns the updated task (with its NEW version).
 *              Write it into the cached list with setQueryData (replace the
 *              task with the same id, in whichever page it is). No refetch.
 *  onError:    if it's an ApiError with isConflict (412: our version was
 *              stale), invalidate the list so the user sees the latest data.
 */
export function useUpdateTask(projectId: string) {
  const api = useTasksApi();
  void api;
  void projectId;

  return useMutation({
    mutationFn: async (_variables: UpdateTaskVariables): Promise<Task> => {
      throw new Error("Not implemented: TODO(5) useUpdateTask");
    },
  });
}
