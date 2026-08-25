import { describe, expect, it } from "vitest";
import { assertWalletCallIntegrity } from "./wallet-call-integrity";

const owner = "0x1111111111111111111111111111111111111111" as const;
const token = "0x2222222222222222222222222222222222222222" as const;
const spender = "3333333333333333333333333333333333333333";
const approval = (amount: bigint) => `0x095ea7b3${spender.padStart(64, "0")}${amount
  .toString(16).padStart(64, "0")}` as const;
const exactApproval = approval(1_000_000n);

describe("wallet call integrity", () => {
  it("accepts a wallet-selected unlimited approval when sufficient approval is allowed", () => {
    expect(() => assertWalletCallIntegrity({ to: token, data: exactApproval, value: "0x0" }, owner, {
      from: owner, to: token, input: approval((1n << 256n) - 1n), value: "0x0",
    }, { allowSufficientApproval: true })).not.toThrow();
  });

  it("accepts the exact mined owner call", () => {
    expect(() => assertWalletCallIntegrity({ to: token, data: exactApproval, value: "0x0" }, owner, {
      from: owner, to: token, input: exactApproval, value: "0x0",
    })).not.toThrow();
  });
});
