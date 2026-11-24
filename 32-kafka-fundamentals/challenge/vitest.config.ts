import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
    // Unit tests use the in-memory broker, so files can run in parallel.
    // The integration tests (test/integration) use unique topic and group names per run.
    fileParallelism: true,
  },
});
