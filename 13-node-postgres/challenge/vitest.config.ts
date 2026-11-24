import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 20_000,
    // Creates the wl_13 database if it doesn't exist yet.
    globalSetup: ["test/globalSetup.ts"],
    // All test files share one database, so run them one at a time.
    fileParallelism: false,
    // Run in a time zone far from UTC so date-handling bugs show up here and
    // not in production (see TODO 1).
    env: { TZ: "Pacific/Auckland" },
  },
});
