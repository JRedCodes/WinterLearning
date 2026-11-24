export interface TaskListProps {
  projectId: string;
  pageSize?: number;
}

/**
 * TODO(6): the task list (a container component: it uses the data hooks and
 * maps their states to UI; rows are rendered by the provided <TaskItem>).
 *
 * Wrap everything in a <section> labelled by an <h2> "Your tasks". Then:
 *  - first load pending   -> "Loading tasks…" (role="status")
 *  - first load failed    -> role="alert" containing
 *                            "Could not load tasks: <message>" and a "Retry" button (refetch)
 *  - no tasks             -> "No tasks yet. Create the first one above."
 *  - otherwise            -> <ul aria-label="Tasks"> of <TaskItem key=... />
 *  - hasNextPage          -> a "Load more" button (fetchNextPage). While the next
 *                            page loads it reads "Loading more…" and is disabled.
 *  - loading more failed  -> role="alert" "Could not load more tasks: <message>",
 *                            and the already-loaded tasks stay on screen.
 *  - status change        -> useUpdateTask(projectId).mutate({ task, patch: { status } })
 *    Pass busy={true} to the TaskItem being updated.
 *  - update failed        -> role="alert":
 *       412 conflict: "This task was changed by someone else. The list now shows the latest version."
 *       otherwise:    "Could not update task: <message>"
 *
 * Use errorMessage() from ../api/errors to turn errors into text.
 */
export function TaskList(_props: TaskListProps) {
  return (
    <section>
      <h2>Your tasks</h2>
      <p>TODO(6)</p>
    </section>
  );
}
