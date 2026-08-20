import { configDefaults, defineConfig } from "vitest/config";
import { fumadocsMdx } from "fumadocs-mdx/vite";

export default defineConfig({
  plugins: fumadocsMdx({ updateViteConfig: false }),
  test: {
    exclude: [
      ...configDefaults.exclude,
      "**/*.fork.test.ts",
      "**/*.integration.test.ts",
    ],
  },
});
