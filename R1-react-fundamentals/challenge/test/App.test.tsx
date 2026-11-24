import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { BOARD_STORAGE_KEY } from "../src/hooks/useBoard";

const column = (name: string) => screen.getByRole("region", { name });
const titlesIn = (name: string) =>
  within(column(name))
    .queryAllByRole("article")
    .map((article) => within(article).getByRole("heading").textContent);

async function addCards(user: ReturnType<typeof userEvent.setup>, ...titles: string[]) {
  for (const title of titles) {
    await user.type(screen.getByLabelText("New card title"), `${title}{Enter}`);
  }
}

describe("<App> integration (all TODOs, filter = TODO 6b)", () => {
  it("adds cards to the To do column", async () => {
    const user = userEvent.setup();
    render(<App />);
    await addCards(user, "Learn hooks", "Write tests");
    expect(titlesIn("To do")).toEqual(["Learn hooks", "Write tests"]);
    expect(within(column("To do")).getByText("2 cards")).toBeInTheDocument();
  });

  it("moves a card across the board and clears the Done column", async () => {
    const user = userEvent.setup();
    render(<App />);
    await addCards(user, "Ship feature");
    await user.click(screen.getByRole("button", { name: "Move Ship feature to Doing" }));
    expect(titlesIn("Doing")).toEqual(["Ship feature"]);
    expect(within(column("To do")).getByText("No cards")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move Ship feature to Done" }));
    expect(titlesIn("Done")).toEqual(["Ship feature"]);
    await user.click(screen.getByRole("button", { name: "Clear done" }));
    expect(titlesIn("Done")).toEqual([]);
  });

  it("deletes a card", async () => {
    const user = userEvent.setup();
    render(<App />);
    await addCards(user, "Keep", "Drop");
    await user.click(screen.getByRole("button", { name: "Delete Drop" }));
    expect(titlesIn("To do")).toEqual(["Keep"]);
  });

  it("filters cards across all columns and reports how many are shown", async () => {
    const user = userEvent.setup();
    render(<App />);
    await addCards(user, "Deploy API", "Write README", "Deploy web");
    await user.click(screen.getByRole("button", { name: "Move Deploy web to Doing" }));

    const filter = screen.getByRole("searchbox", { name: "Filter cards" });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await user.type(filter, "deploy");
    expect(titlesIn("To do")).toEqual(["Deploy API"]);
    expect(titlesIn("Doing")).toEqual(["Deploy web"]);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 2 of 3 cards");

    await user.clear(filter);
    expect(titlesIn("To do")).toEqual(["Deploy API", "Write README"]);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("persists the board in localStorage and restores it on the next visit", async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await addCards(user, "Survive reload");
    await user.click(screen.getByRole("button", { name: "Move Survive reload to Doing" }));
    expect(window.localStorage.getItem(BOARD_STORAGE_KEY)).toContain("Survive reload");
    first.unmount();

    render(<App />);
    expect(titlesIn("Doing")).toEqual(["Survive reload"]);
  });
});
