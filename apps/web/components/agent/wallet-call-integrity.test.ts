import { describe, expect, it } from "vitest";
import { assertWalletCallIntegrity } from "./wallet-call-integrity";

const owner = "0x1111111111111111111111111111111111111111" as const;
const token = "0x2222222222222222222222222222222222222222" as const;
const exactApproval = `0x095ea7b3${"00".repeat(64)}` as const;

describe("wallet call integrity", () => {
  it("rejects a wallet-broadened approval before the next verified call", () => {
    expect(() => assertWalletCallIntegrity({ to: token, data: exactApproval, value: "0x0" }, owner, {
      from: owner, to: token, input: `0x095ea7b3${"ff".repeat(64)}`, value: "0x0",
    })).toThrow(/changed the exact token approval/i);
  });

  it("accepts the exact mined owner call", () => {
    expect(() => assertWalletCallIntegrity({ to: token, data: exactApproval, value: "0x0" }, owner, {
      from: owner, to: token, input: exactApproval, value: "0x0",
    })).not.toThrow();
  });
});
