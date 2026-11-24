/**
 * Query key factory. Every cache entry for tasks starts with ["tasks"], so
 * `invalidateQueries({ queryKey: taskKeys.all })` hits all of them, and
 * `taskKeys.list(projectId)` targets one project's list.
 * Keys are arrays, compared by value, from left to right (prefix matching).
 */
export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (projectId: string) => [...taskKeys.lists(), projectId] as const,
};
