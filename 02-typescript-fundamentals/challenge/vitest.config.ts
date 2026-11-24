import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runtime tests. Type-level tests live in test/types/*.test-d.ts and are
    // checked by the compiler (see test/typecheck.test.ts), not executed.
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    // Set to false when test files share a database or Redis instance.
    fileParallelism: true,
  },
});
