import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 20_000,
    // Creates the wl_12 database if it doesn't exist.
    globalSetup: ["test/globalSetup.ts"],
    // All test files share one database, so run them one at a time.
    fileParallelism: false,
  },
});
