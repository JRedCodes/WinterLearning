import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createApiClient } from "./api/client";
import { createTasksApi } from "./api/tasks";
import { TasksApiProvider } from "./api/TasksApiContext";
import { loadConfig } from "./lib/config";
import { createQueryClient } from "./lib/queryClient";
import "./styles.css";

// Composition root: the one place that knows about config and real implementations.
const config = loadConfig();
const tasksApi = createTasksApi(createApiClient({ baseUrl: config.apiUrl }));
const queryClient = createQueryClient();

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TasksApiProvider api={tasksApi}>
        <App projectId={config.projectId} />
      </TasksApiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
