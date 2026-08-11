import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 240_000,
    include: ["**/*.fork.test.ts"],
    maxWorkers: 1,
    testTimeout: 240_000,
  },
});
