import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
    // No shared database or Redis here: every test builds its own app, logger and registry.
    fileParallelism: true,
  },
});
