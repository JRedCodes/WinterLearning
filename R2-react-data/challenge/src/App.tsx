import { ErrorBoundary } from "./components/ErrorBoundary";
import { NewTaskForm } from "./components/NewTaskForm";
import { TaskList } from "./components/TaskList";

/** Page layout. All data access happens in hooks; App only composes. */
export function App({ projectId }: { projectId: string }) {
  return (
    <main className="app">
      <h1>Tasks</h1>
      <ErrorBoundary>
        <NewTaskForm projectId={projectId} />
        <TaskList projectId={projectId} />
      </ErrorBoundary>
    </main>
  );
}
