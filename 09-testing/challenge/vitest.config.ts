import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    testTimeout: 10_000,
    hookTimeout: 20_000,
    // Test files share one Postgres database, so run them one at a time.
    fileParallelism: false,
  },
});
