import { useId } from "react";
import { isOptimistic } from "../lib/optimistic";
import { STATUS_LABELS, TASK_STATUSES, type Task, type TaskStatus } from "../schemas/task";

export interface TaskItemProps {
  task: Task;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  /** True while an update for this task is in flight. */
  busy?: boolean;
}

/** One task row. Presentational: no hooks that talk to the API. */
export function TaskItem({ task, onStatusChange, busy = false }: TaskItemProps) {
  const titleId = useId();
  const pending = isOptimistic(task);

  return (
    <li className="task">
      <article aria-labelledby={titleId} aria-busy={pending || busy || undefined}>
        <h3 id={titleId}>{task.title}</h3>
        <p className="meta">
          <span className={`priority priority-${task.priority}`}>{task.priority}</span>
          {task.dueDate && <span> · due {task.dueDate}</span>}
          {pending && <span> · Saving…</span>}
        </p>
        <select
          aria-label={`Status of ${task.title}`}
          value={task.status}
          disabled={pending || busy}
          onChange={(e) => onStatusChange(task, e.target.value as TaskStatus)}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </article>
    </li>
  );
}
