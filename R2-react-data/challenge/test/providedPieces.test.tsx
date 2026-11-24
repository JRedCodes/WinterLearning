import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { loadConfig } from "../src/lib/config";

// These pieces are provided and already work. The tests document how they behave.

describe("loadConfig (provided)", () => {
  it("uses defaults when nothing is set", () => {
    expect(loadConfig({})).toEqual({ apiUrl: "http://localhost:3000", projectId: "demo" });
  });

  it("reads VITE_ variables and rejects invalid ones", () => {
    expect(loadConfig({ VITE_API_URL: "https://api.example.com", VITE_PROJECT_ID: "p1" })).toEqual({
      apiUrl: "https://api.example.com",
      projectId: "p1",
    });
    expect(() => loadConfig({ VITE_API_URL: "not a url" })).toThrow(/Invalid frontend config/);
  });
});

describe("<ErrorBoundary> (provided)", () => {
  function Bomb({ explode }: { explode: boolean }) {
    if (explode) throw new Error("render failed");
    return <p>All good</p>;
  }

  function Harness() {
    const [explode, setExplode] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setExplode(false)}>
          Fix it
        </button>
        <ErrorBoundary>
          <Bomb explode={explode} />
        </ErrorBoundary>
      </>
    );
  }

  it("shows a fallback instead of crashing, and recovers on Try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // React logs caught errors
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    await user.click(screen.getByRole("button", { name: "Fix it" }));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("All good")).toBeInTheDocument();
  });
});
