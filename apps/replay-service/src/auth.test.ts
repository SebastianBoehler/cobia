import { describe, expect, it } from "vitest";
import { authorized } from "./auth";

describe("replay service authorization", () => {
  const secret = "s".repeat(32);

  it("accepts only the exact bearer secret", () => {
    expect(authorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(authorized(`Bearer ${"x".repeat(32)}`, secret)).toBe(false);
    expect(authorized(undefined, secret)).toBe(false);
  });
});
