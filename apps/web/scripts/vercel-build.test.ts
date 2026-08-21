import { describe, expect, it } from "vitest";
import { vercelBuildSteps } from "./vercel-build.mjs";

describe("Vercel build policy", () => {
  it("builds without mutating a production database", () => {
    expect(vercelBuildSteps({ VERCEL_ENV: "production" })).toEqual([
      ["pnpm", ["exec", "next", "build"]],
    ]);
    expect(vercelBuildSteps({ VERCEL_ENV: "preview" })).toEqual([
      ["pnpm", ["exec", "next", "build"]],
    ]);
  });
});
