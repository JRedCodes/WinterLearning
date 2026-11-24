import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
    // All test files share Redis database 3 (= 19 mod 16), so run them one at a time.
    fileParallelism: false,
  },
});
