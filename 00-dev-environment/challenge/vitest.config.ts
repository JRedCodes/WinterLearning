import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
    // The integration test talks to the shared Postgres/Redis, so run files one at a time.
    fileParallelism: false,
    globalSetup: ["test/globalSetup.ts"],
  },
});
