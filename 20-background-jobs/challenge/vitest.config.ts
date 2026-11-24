import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // All test files share Redis database 4 (= 20 mod 16), so run them one at a time.
    fileParallelism: false,
  },
});
