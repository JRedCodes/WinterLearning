import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Column } from "../src/components/Column";
import { COLUMNS, type Card } from "../src/domain/board";

const doing = COLUMNS[1];
const cards: Card[] = [
  { id: "a", title: "Refactor auth", columnId: "doing" },
  { id: "b", title: "Add metrics", columnId: "doing" },
];

describe("<Column> (TODO 3)", () => {
  it("is a region named by its heading", () => {
    render(<Column column={doing} cards={cards} onMove={vi.fn()} onRemove={vi.fn()} />);
    const region = screen.getByRole("region", { name: "Doing" });
    expect(within(region).getByRole("heading", { level: 2, name: "Doing" })).toBeInTheDocument();
  });

  it("lists one item per card, in order", () => {
    render(<Column column={doing} cards={cards} onMove={vi.fn()} onRemove={vi.fn()} />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => within(li).getByRole("heading").textContent)).toEqual(["Refactor auth", "Add metrics"]);
  });

  it.each([
    [0, "0 cards"],
    [1, "1 card"],
    [2, "2 cards"],
  ])("shows the count for %i card(s) as %j", (n, text) => {
    render(<Column column={doing} cards={cards.slice(0, n)} onMove={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("shows an empty state and no list when there are no cards", () => {
    render(<Column column={doing} cards={[]} onMove={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("No cards")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders its children (composition)", () => {
    render(
      <Column column={doing} cards={[]} onMove={vi.fn()} onRemove={vi.fn()}>
        <button type="button">Slot content</button>
      </Column>,
    );
    expect(within(screen.getByRole("region", { name: "Doing" })).getByRole("button", { name: "Slot content" })).toBeInTheDocument();
  });

  it("forwards onMove and onRemove to its cards", async () => {
    const onMove = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<Column column={doing} cards={cards} onMove={onMove} onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: "Move Add metrics to Done" }));
    await user.click(screen.getByRole("button", { name: "Delete Refactor auth" }));
    expect(onMove).toHaveBeenCalledWith("b", "done");
    expect(onRemove).toHaveBeenCalledWith("a");
  });

  it("gives every card a key (React logs no key warning)", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Column column={doing} cards={cards} onMove={vi.fn()} onRemove={vi.fn()} />);
    const keyWarnings = consoleError.mock.calls.filter((args) => args.some((a) => String(a).includes("key")));
    consoleError.mockRestore();
    expect(keyWarnings, "React warned about missing keys").toEqual([]);
  });
});
