import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { PROJECT_ID, installFakeApi, makeTask, problem } from "./helpers/fakeApi";
import { renderWithProviders } from "./helpers/render";

const LIST_PATH = `/v1/projects/${PROJECT_ID}/tasks`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function renderApp(initial = [makeTask({ title: "Existing" })]) {
  const fake = installFakeApi(initial);
  const utils = renderWithProviders(<App projectId={PROJECT_ID} />);
  if (initial.length > 0) await screen.findByRole("heading", { name: "Existing" });
  else await screen.findByText(/No tasks yet/);
  return { fake, ...utils };
}

const titles = () =>
  within(screen.getByRole("list", { name: "Tasks" }))
    .getAllByRole("article")
    .map((a) => within(a).getByRole("heading").textContent);

describe("<NewTaskForm> validation (TODO 7)", () => {
  it("has labelled fields with sensible defaults", async () => {
    await renderApp();
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Priority")).toHaveValue("medium");
    expect(screen.getByLabelText("Due date")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled();
  });

  it("validates with the shared schema before sending anything", async () => {
    const { fake, user } = await renderApp();
    await user.type(screen.getByLabelText("Title"), "   ");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Title")).toHaveAccessibleDescription("Title is required");
    expect(fake.requestsTo("POST", LIST_PATH)).toHaveLength(0);
  });

  it("clears a field's error when the user edits it", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "x");
    expect(screen.queryByText("Title is required")).not.toBeInTheDocument();
  });
});

describe("<NewTaskForm> + useCreateTask (TODO 4, 7)", () => {
  it("sends the trimmed, validated input with a UUID Idempotency-Key, then resets the form", async () => {
    const { fake, user } = await renderApp();
    await user.type(screen.getByLabelText("Title"), "  Write runbook  ");
    await user.selectOptions(screen.getByLabelText("Priority"), "high");
    await user.type(screen.getByLabelText("Due date"), "2026-12-24");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(""));
    const [post] = fake.requestsTo("POST", LIST_PATH);
    expect(post?.body).toEqual({ title: "Write runbook", priority: "high", dueDate: "2026-12-24" });
    expect(post?.headers.get("idempotency-key")).toMatch(UUID);
    expect(screen.getByLabelText("Priority")).toHaveValue("medium");
    expect(screen.getByLabelText("Due date")).toHaveValue("");
  });

  it("sends dueDate null when no date is picked, and a new Idempotency-Key per submission", async () => {
    const { fake, user } = await renderApp();
    await user.type(screen.getByLabelText("Title"), "First{Enter}");
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(""));
    await user.type(screen.getByLabelText("Title"), "Second{Enter}");
    await waitFor(() => expect(fake.requestsTo("POST", LIST_PATH)).toHaveLength(2));

    const [a, b] = fake.requestsTo("POST", LIST_PATH);
    expect(a?.body).toMatchObject({ title: "First", dueDate: null, priority: "medium" });
    expect(a?.headers.get("idempotency-key")).not.toBe(b?.headers.get("idempotency-key"));
  });

  it("shows the new task immediately (optimistic), then replaces it with the server's version", async () => {
    const { fake, user } = await renderApp();
    const release = fake.holdNext("POST", LIST_PATH);

    await user.type(screen.getByLabelText("Title"), "Optimistic task{Enter}");

    // Before the server has answered:
    expect(await screen.findByRole("heading", { name: "Optimistic task" })).toBeInTheDocument();
    expect(titles()).toEqual(["Optimistic task", "Existing"]);
    expect(screen.getByText(/Saving…/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();

    release();

    await waitFor(() => expect(screen.queryByText(/Saving…/)).not.toBeInTheDocument());
    expect(titles()).toEqual(["Optimistic task", "Existing"]); // exactly once, no duplicate
    expect(fake.requestsTo("GET", LIST_PATH).length, "the list should be refetched after the mutation").toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled();
  });

  it("rolls the optimistic task back and shows an error when the server fails", async () => {
    const { fake, user } = await renderApp();
    fake.failNext("POST", LIST_PATH, () => problem(500, "Internal Server Error", "Database unavailable"));

    await user.type(screen.getByLabelText("Title"), "Doomed{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create task: Database unavailable");
    expect(screen.queryByRole("heading", { name: "Doomed" })).not.toBeInTheDocument();
    expect(titles()).toEqual(["Existing"]);
    expect(screen.getByLabelText("Title"), "keep the user's input after a failure").toHaveValue("Doomed");
  });

  it("shows the server's field errors next to the field", async () => {
    const { user } = await renderApp();
    await user.type(screen.getByLabelText("Title"), "existing{Enter}"); // duplicate title (case-insensitive)

    expect(await screen.findByText("Title must be unique in this project")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not create task");
    expect(titles()).toEqual(["Existing"]);
  });

  it("works when the list starts empty", async () => {
    const { user } = await renderApp([]);
    await user.type(screen.getByLabelText("Title"), "Very first{Enter}");
    expect(await screen.findByRole("heading", { name: "Very first" })).toBeInTheDocument();
  });
});
