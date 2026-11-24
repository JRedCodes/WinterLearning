import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { createApiClient } from "../../src/api/client";
import { createTasksApi } from "../../src/api/tasks";
import { TasksApiProvider } from "../../src/api/TasksApiContext";
import { API_URL } from "./fakeApi";

/**
 * Renders `ui` with the same providers as main.tsx, but with a fresh
 * QueryClient per test (no cache shared between tests) and no retries
 * (a failing request fails immediately instead of after backoff).
 * The real ApiClient is used: it calls the global fetch, which the test stubs.
 */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const api = createTasksApi(createApiClient({ baseUrl: API_URL }));
  const user = userEvent.setup();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <TasksApiProvider api={api}>{ui}</TasksApiProvider>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient, user };
}
