import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Tests share the wl_21 database and Redis DB 5, so run files one at a time.
    fileParallelism: false,
  },
});
