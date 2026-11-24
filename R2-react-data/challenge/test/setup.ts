// Runs before every test file (vitest.config.ts -> test.setupFiles).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals(); // undo vi.stubGlobal("fetch", ...)
  vi.restoreAllMocks();
});
