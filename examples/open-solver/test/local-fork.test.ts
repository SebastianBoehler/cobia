import { describe, expect, it } from "vitest";
import { reserveLocalPort } from "../src/local-fork";

describe("local fork port reservation", () => {
  it("gives concurrent solver jobs distinct Anvil ports", async () => {
    const [first, second] = await Promise.all([reserveLocalPort(), reserveLocalPort()]);
    try {
      expect(first.port).not.toBe(second.port);
    } finally {
      first.release();
      second.release();
    }
  });
});
