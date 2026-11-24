import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // Recreates the wl_14 schema, applies every migration, loads ~380k seed rows, ANALYZEs.
    globalSetup: ["test/globalSetup.ts"],
    // All test files share one seeded database, so run them one at a time.
    fileParallelism: false,
  },
});
