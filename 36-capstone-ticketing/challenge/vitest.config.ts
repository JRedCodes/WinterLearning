import { defineConfig } from "vitest/config";

/**
 * One package, source under api/. The web app (web/) has its own package.json
 * and its own test setup, so it is deliberately NOT included here.
 */
export default defineConfig({
  test: {
    include: ["api/test/**/*.test.ts"],
    globalSetup: ["api/test/globalSetup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Every test file shares one database (wl_36) and one Redis db, so run files one at a time.
    fileParallelism: false,
  },
});
