import { describe, expect, it } from "vitest";
import { vercelBuildSteps } from "./vercel-build.mjs";

describe("Vercel build policy", () => {
  it("migrates only a production database before building", () => {
    expect(vercelBuildSteps({ VERCEL_ENV: "production" })).toEqual([
      ["pnpm", ["exec", "drizzle-kit", "migrate"]],
      ["pnpm", ["exec", "next", "build"]],
    ]);
    expect(vercelBuildSteps({ VERCEL_ENV: "preview" })).toEqual([
      ["pnpm", ["exec", "next", "build"]],
    ]);
  });
});
