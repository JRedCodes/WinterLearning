import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
    // No shared database or Redis: every test builds its own in-memory app.
    fileParallelism: true,
  },
});
