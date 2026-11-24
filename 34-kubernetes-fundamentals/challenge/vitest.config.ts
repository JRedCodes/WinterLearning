import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
    // No database or Redis: every test file only reads YAML or uses in-memory fakes.
    fileParallelism: true,
  },
});
