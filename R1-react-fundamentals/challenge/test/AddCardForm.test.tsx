import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddCardForm } from "../src/components/AddCardForm";

function setup() {
  const onAdd = vi.fn();
  render(<AddCardForm onAdd={onAdd} />);
  return {
    onAdd,
    user: userEvent.setup(),
    input: screen.getByLabelText("New card title"),
    button: screen.getByRole("button", { name: "Add card" }),
  };
}

describe("<AddCardForm> (TODO 5)", () => {
  it("has a labelled text input and an Add card button", () => {
    const { input } = setup();
    expect(input).toHaveRole("textbox");
    expect(input).toHaveValue("");
  });

  it("submits the trimmed title and clears the input", async () => {
    const { onAdd, user, input, button } = setup();
    await user.type(input, "  Plan sprint  ");
    expect(input).toHaveValue("  Plan sprint  "); // controlled: shows exactly what was typed
    await user.click(button);
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("Plan sprint");
    expect(input).toHaveValue("");
  });

  it("submits on Enter too", async () => {
    const { onAdd, user, input } = setup();
    await user.type(input, "Book flights{Enter}");
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("Book flights");
  });

  it("shows an error for a blank title and does not call onAdd", async () => {
    const { onAdd, user, input, button } = setup();
    await user.type(input, "   ");
    await user.click(button);
    expect(screen.getByRole("alert")).toHaveTextContent("Title is required");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows an error for a title over 80 characters", async () => {
    const { onAdd, user, input, button } = setup();
    await user.click(input);
    await user.paste("x".repeat(81));
    await user.click(button);
    expect(screen.getByRole("alert")).toHaveTextContent("Title must be 80 characters or fewer");
    expect(onAdd).not.toHaveBeenCalled();
    expect(input).toHaveValue("x".repeat(81)); // keep the user's text so they can fix it
  });

  it("clears the error as soon as the user edits the input", async () => {
    const { user, input, button } = setup();
    await user.click(button);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.type(input, "a");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });
});
