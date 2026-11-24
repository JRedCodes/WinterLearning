import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Reuses the Vite config (React plugin) and adds the test settings.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["test/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      setupFiles: ["test/setup.ts"],
      testTimeout: 10_000,
      fileParallelism: true,
    },
  }),
);
