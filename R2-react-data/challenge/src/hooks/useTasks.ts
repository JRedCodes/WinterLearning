import { useInfiniteQuery } from "@tanstack/react-query";
import { useTasksApi } from "../api/TasksApiContext";
import type { Task, TaskPage } from "../schemas/task";
import { taskKeys } from "./queryKeys";

export const DEFAULT_PAGE_SIZE = 10;

/**
 * TODO(3): the task list, page by page, with useInfiniteQuery.
 *
 *  - queryKey: taskKeys.list(projectId)
 *  - queryFn: call api.list with the page's cursor (pageParam), `limit: pageSize`,
 *    and the `signal` TanStack Query gives you (so it can cancel requests).
 *  - initialPageParam: null (first page has no cursor)
 *  - getNextPageParam: the last page's `page.nextCursor`, or undefined when
 *    there is none (undefined means "no next page"; null doesn't!)
 *  - select: flatten the pages so `data` is a plain Task[] for components.
 *
 * The placeholder below never fetches anything.
 */
export function useTasks(projectId: string, pageSize = DEFAULT_PAGE_SIZE) {
  const api = useTasksApi();
  void api;
  void pageSize;

  return useInfiniteQuery({
    queryKey: taskKeys.list(projectId),
    queryFn: (): Promise<TaskPage> => new Promise(() => {}), // TODO(3): replace
    initialPageParam: null as string | null,
    getNextPageParam: (): string | undefined => undefined,
    select: (data): Task[] => data.pages.flatMap((page) => page.data),
  });
}
