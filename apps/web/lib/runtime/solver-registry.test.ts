import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { trustedRouteSolverAddress } from "./solver-registry";

const deterministic = `0x${"11".repeat(32)}` as const;
const agentic = `0x${"22".repeat(32)}` as const;
const source = {
  DETERMINISTIC_SOLVER_PRIVATE_KEY: deterministic,
  AI_SOLVER_PRIVATE_KEY: agentic,
};

describe("trusted V2 solver registry", () => {
  it("derives only the configured deterministic and agentic identities", () => {
    expect(trustedRouteSolverAddress("deterministic-v2", source))
      .toBe(privateKeyToAccount(deterministic).address);
    expect(trustedRouteSolverAddress("agentic-v2", source))
      .toBe(privateKeyToAccount(agentic).address);
    expect(() => trustedRouteSolverAddress("spoofed", source)).toThrow("not trusted");
  });

  it("fails closed without the selected solver key", () => {
    expect(() => trustedRouteSolverAddress("agentic-v2", {
      DETERMINISTIC_SOLVER_PRIVATE_KEY: deterministic,
    })).toThrow("AI_SOLVER_PRIVATE_KEY");
  });
});
