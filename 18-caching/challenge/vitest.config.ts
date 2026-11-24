import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
    // Creates the wl_18 database if it doesn't exist yet.
    globalSetup: ["test/globalSetup.ts"],
    // Test files share one Postgres database and one Redis database.
    fileParallelism: false,
  },
});
