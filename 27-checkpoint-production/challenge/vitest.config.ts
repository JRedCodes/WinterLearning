import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // All test files share one database (wl_27) and one Redis prefix (wl:27:), so run them one at a time.
    fileParallelism: false,
  },
});
