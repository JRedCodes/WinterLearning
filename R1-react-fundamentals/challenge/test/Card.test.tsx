import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Card } from "../src/components/Card";
import type { Card as CardModel } from "../src/domain/board";

function renderCard(card: CardModel) {
  const onMove = vi.fn();
  const onRemove = vi.fn();
  // A Card is an <li>, so render it inside a list like the real app does.
  render(
    <ul>
      <Card card={card} onMove={onMove} onRemove={onRemove} />
    </ul>,
  );
  return { onMove, onRemove, user: userEvent.setup() };
}

describe("<Card> (TODO 4)", () => {
  it("renders a list item containing an article named after the card", () => {
    renderCard({ id: "c1", title: "Write docs", columnId: "todo" });
    const item = screen.getByRole("listitem");
    expect(item).toContainElement(screen.getByRole("article", { name: "Write docs" }));
    expect(screen.getByRole("heading", { level: 3, name: "Write docs" })).toBeInTheDocument();
  });

  it("in the first column it can only move right", async () => {
    const { onMove, user } = renderCard({ id: "c1", title: "Write docs", columnId: "todo" });
    expect(screen.queryByRole("button", { name: /^Move Write docs to To do$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move Write docs to Doing" }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith("c1", "doing");
  });

  it("in the middle column it can move both ways", async () => {
    const { onMove, user } = renderCard({ id: "c2", title: "Fix bug", columnId: "doing" });
    await user.click(screen.getByRole("button", { name: "Move Fix bug to To do" }));
    await user.click(screen.getByRole("button", { name: "Move Fix bug to Done" }));
    expect(onMove.mock.calls).toEqual([
      ["c2", "todo"],
      ["c2", "done"],
    ]);
  });

  it("in the last column it can only move left", () => {
    renderCard({ id: "c3", title: "Ship it", columnId: "done" });
    expect(screen.getByRole("button", { name: "Move Ship it to Doing" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Move/ })).toHaveLength(1);
  });

  it("has a delete button that calls onRemove with the card id", async () => {
    const { onRemove, user } = renderCard({ id: "c9", title: "Old task", columnId: "doing" });
    await user.click(screen.getByRole("button", { name: "Delete Old task" }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith("c9");
  });

  it("uses type=button so its buttons never submit a surrounding form", () => {
    renderCard({ id: "c2", title: "Fix bug", columnId: "doing" });
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });
});
