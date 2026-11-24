import { useMutation } from "@tanstack/react-query";
import { useTasksApi } from "../api/TasksApiContext";
import type { NewTask } from "../schemas/task";

export interface CreateTaskVariables {
  input: NewTask;
  /** One key per user intent. A retry of the same submission reuses it, so the server creates the task once. */
  idempotencyKey: string;
}

/**
 * TODO(4): create a task, OPTIMISTICALLY.
 *
 *  mutationFn: api.create(projectId, input, idempotencyKey)
 *  onMutate:
 *    1. cancel in-flight queries for taskKeys.list(projectId) (they would
 *       overwrite the optimistic entry)
 *    2. snapshot the current cache entry (InfiniteData<TaskPage>) for rollback
 *    3. if there is cached data, put optimisticTask(...) (../lib/optimistic)
 *       at the FRONT of the FIRST page (the list is newest-first). Don't mutate:
 *       build new objects/arrays.
 *    4. return { previous } as the mutation context
 *  onError:   restore the snapshot
 *  onSettled: invalidate taskKeys.list(projectId) so the cache re-syncs with
 *             the server (return the promise, so the mutation stays pending
 *             until the refetch finishes)
 *
 * useQueryClient() gives you the QueryClient.
 */
export function useCreateTask(projectId: string) {
  const api = useTasksApi();
  void api;
  void projectId;

  return useMutation({
    mutationFn: async (_variables: CreateTaskVariables) => {
      throw new Error("Not implemented: TODO(4) useCreateTask");
    },
  });
}
