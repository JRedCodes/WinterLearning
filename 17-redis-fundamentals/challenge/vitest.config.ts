import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
    // All test files share one Redis database (index 1) and the wl:17: prefix,
    // so they must not run at the same time.
    fileParallelism: false,
  },
});
