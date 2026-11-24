import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
    // Set to false when test files share a database or Redis instance.
    fileParallelism: true,
  },
});
