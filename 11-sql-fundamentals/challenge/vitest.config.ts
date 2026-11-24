import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
    // Creates wl_11 (if needed) and loads sql/schema.sql + sql/seed.sql once per run.
    globalSetup: ["test/globalSetup.ts"],
    // All test files share one database.
    fileParallelism: false,
  },
});
