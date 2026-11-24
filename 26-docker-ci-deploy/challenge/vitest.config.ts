import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // The API tests share one database (wl_26), so run files one at a time.
    fileParallelism: false,
  },
});
