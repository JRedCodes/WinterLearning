import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskList } from "../src/components/TaskList";
import { PROJECT_ID, installFakeApi, makeTask, problem } from "./helpers/fakeApi";
import { renderWithProviders } from "./helpers/render";

const LIST_PATH = `/v1/projects/${PROJECT_ID}/tasks`;
const titles = () =>
  within(screen.getByRole("list", { name: "Tasks" }))
    .getAllByRole("article")
    .map((a) => within(a).getByRole("heading").textContent);

describe("<TaskList> + useTasks (TODO 3, 6)", () => {
  it("shows a loading state, then the tasks", async () => {
    installFakeApi([makeTask({ title: "Newest" }), makeTask({ title: "Older" })]);
    renderWithProviders(<TaskList projectId={PROJECT_ID} />);
    expect(screen.getByText("Loading tasks…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Newest" })).toBeInTheDocument();
    expect(titles()).toEqual(["Newest", "Older"]);
    expect(screen.queryByText("Loading tasks…")).not.toBeInTheDocument();
  });

  it("shows an empty state when the project has no tasks", async () => {
    installFakeApi([]);
    renderWithProviders(<TaskList projectId={PROJECT_ID} />);
    expect(await screen.findByText("No tasks yet. Create the first one above.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows the API's error message with a Retry button that refetches", async () => {
    const fake = installFakeApi([makeTask({ title: "Recovered" })]);
    fake.failNext("GET", LIST_PATH, () => problem(503, "Service Unavailable", "Database is down"));
    const { user } = renderWithProviders(<TaskList projectId={PROJECT_ID} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load tasks: Database is down");

    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Recovered" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a friendly message when the network is down", async () => {
    const fake = installFakeApi([]);
    fake.failNext("GET", LIST_PATH, () => Promise.reject(new TypeError("Failed to fetch")));
    renderWithProviders(<TaskList projectId={PROJECT_ID} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Network error: could not reach the server");
  });

  it("loads more pages with the cursor until there are no more", async () => {
    const fake = installFakeApi(Array.from({ length: 5 }, (_, i) => makeTask({ title: `T${i + 1}` })));
    const { user } = renderWithProviders(<TaskList projectId={PROJECT_ID} pageSize={2} />);

    await screen.findByRole("heading", { name: "T1" });
    expect(titles()).toEqual(["T1", "T2"]);

    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: "T4" });
    expect(titles()).toEqual(["T1", "T2", "T3", "T4"]);

    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: "T5" });
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();

    const cursors = fake.requestsTo("GET", LIST_PATH).map((r) => r.url.searchParams.get("cursor"));
    expect(cursors[0]).toBeNull();
    expect(cursors).toHaveLength(3);
    expect(new Set(cursors).size, "each page must send the previous page's nextCursor").toBe(3);
    expect(fake.requests.every((r) => r.url.searchParams.get("limit") === "2")).toBe(true);
  });

  it("disables Load more while the next page is loading", async () => {
    const fake = installFakeApi(Array.from({ length: 3 }, (_, i) => makeTask({ title: `T${i + 1}` })));
    const { user } = renderWithProviders(<TaskList projectId={PROJECT_ID} pageSize={2} />);
    await screen.findByRole("heading", { name: "T1" });

    const release = fake.holdNext("GET", LIST_PATH);
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("button", { name: "Loading more…" })).toBeDisabled();

    release();
    await screen.findByRole("heading", { name: "T3" });
  });

  it("keeps the loaded tasks when loading more fails", async () => {
    const fake = installFakeApi(Array.from({ length: 3 }, (_, i) => makeTask({ title: `T${i + 1}` })));
    const { user } = renderWithProviders(<TaskList projectId={PROJECT_ID} pageSize={2} />);
    await screen.findByRole("heading", { name: "T1" });

    fake.failNext("GET", LIST_PATH, () => problem(500, "Internal Server Error", "boom"));
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load more tasks");
    expect(titles()).toEqual(["T1", "T2"]);
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
  });
});

describe("<TaskList> + useUpdateTask (TODO 5)", () => {
  it("changes a task's status with If-Match and writes the server's answer into the cache (no refetch)", async () => {
    const task = makeTask({ title: "Ship it", version: 2 });
    const fake = installFakeApi([task]);
    const { user } = renderWithProviders(<TaskList projectId={PROJECT_ID} />);

    const select = await screen.findByRole("combobox", { name: "Status of Ship it" });
    await user.selectOptions(select, "done");

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Status of Ship it" })).toHaveValue("done"));
    const [patch] = fake.requestsTo("PATCH", `/v1/tasks/${task.id}`);
    expect(patch?.headers.get("if-match")).toBe('"2"');
    expect(patch?.body).toEqual({ status: "done" });
    expect(fake.requestsTo("GET", LIST_PATH), "the list should be updated from the PATCH response, not refetched").toHaveLength(1);

    // The cache now holds version 3, so the NEXT update must send If-Match "3".
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Status of Ship it" })).toBeEnabled());
    await user.selectOptions(screen.getByRole("combobox", { name: "Status of Ship it" }), "in_progress");
    await waitFor(() => expect(fake.requestsTo("PATCH", `/v1/tasks/${task.id}`)).toHaveLength(2));
    expect(fake.requestsTo("PATCH", `/v1/tasks/${task.id}`)[1]?.headers.get("if-match")).toBe('"3"');
  });

  it("on a 412 conflict, explains it and refetches the latest version", async () => {
    const task = makeTask({ title: "Contended", version: 1 });
    const fake = installFakeApi([task]);
    const { user } = renderWithProviders(<TaskList projectId={PROJECT_ID} />);
    await screen.findByRole("heading", { name: "Contended" });

    // Meanwhile, a teammate renames it and moves it to "in_progress" (version 2).
    fake.tasks[0] = { ...task, title: "Contended (renamed)", status: "in_progress", version: 2 };

    await user.selectOptions(screen.getByRole("combobox", { name: "Status of Contended" }), "done");

    expect(await screen.findByRole("alert")).toHaveTextContent("changed by someone else");
    expect(await screen.findByRole("heading", { name: "Contended (renamed)" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status of Contended (renamed)" })).toHaveValue("in_progress");
  });

  it("shows other update errors", async () => {
    const task = makeTask({ title: "Fragile" });
    const fake = installFakeApi([task]);
    const { user } = renderWithProviders(<TaskList projectId={PROJECT_ID} />);
    await screen.findByRole("heading", { name: "Fragile" });

    fake.failNext("PATCH", "/v1/tasks/", () => problem(500, "Internal Server Error", "Write failed"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Status of Fragile" }), "done");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update task: Write failed");
    expect(screen.getByRole("combobox", { name: "Status of Fragile" })).toHaveValue("todo");
  });
});
