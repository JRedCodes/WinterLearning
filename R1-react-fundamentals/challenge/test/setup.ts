// Runs before every test file (vitest.config.ts -> test.setupFiles).
import "@testing-library/jest-dom/vitest"; // adds matchers like toBeInTheDocument()
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup(); // unmount everything rendered in the test
  window.localStorage.clear(); // no state leaks between tests
});
