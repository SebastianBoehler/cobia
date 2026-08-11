import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 240_000,
    include: ["**/*.integration.test.ts"],
    maxWorkers: 1,
    testTimeout: 30_000,
  },
});
