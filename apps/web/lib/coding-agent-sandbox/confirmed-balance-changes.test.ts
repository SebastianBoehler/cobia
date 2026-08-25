import { describe, expect, it, vi } from "vitest";
import { readConfirmedBalanceChanges } from "./confirmed-balance-changes";

const owner = "0x1111111111111111111111111111111111111111" as const;
const token = "0x2222222222222222222222222222222222222222" as const;

describe("confirmed balance changes", () => {
  it("measures the owner's constrained token balance at the confirmed block", async () => {
    const readBalance = vi.fn(async () => 1_525_994n);

    await expect(readConfirmedBalanceChanges({
      evidence: { balanceDeltas: [{
        token, account: owner, beforeAtomic: "525665", afterAtomic: "1525994",
      }] },
      owner,
      blockNumber: 456n,
      readBalance,
    })).resolves.toEqual([{ token, beforeAtomic: "525665", afterAtomic: "1525994" }]);
    expect(readBalance).toHaveBeenCalledWith(token, owner, 456n);
  });

  it("does not report balances attributed to a different account", async () => {
    const readBalance = vi.fn(async () => 1n);
    await expect(readConfirmedBalanceChanges({
      evidence: { balanceDeltas: [{
        token, account: "0x3333333333333333333333333333333333333333",
        beforeAtomic: "0", afterAtomic: "1",
      }] },
      owner,
      blockNumber: 456n,
      readBalance,
    })).resolves.toEqual([]);
    expect(readBalance).not.toHaveBeenCalled();
  });

  it("reports both sides of a confirmed swap and omits a settled intermediate balance", async () => {
    const source = "0x3333333333333333333333333333333333333333" as const;
    const intermediate = "0x4444444444444444444444444444444444444444" as const;
    const readBalance = vi.fn(async (asset: string) => asset === token ? 1_171_680n
      : asset === source ? 0n : 500n);
    await expect(readConfirmedBalanceChanges({
      evidence: { simulations: [{ assetDeltas: [{
        token, account: owner, beforeAtomic: "0", afterAtomic: "1171695",
      }, {
        token: source, account: owner,
        beforeAtomic: "1000000", afterAtomic: "0",
      }, {
        token: intermediate, account: owner, beforeAtomic: "500", afterAtomic: "1000000",
      }] }, { assetDeltas: [{
        token: intermediate, account: owner, beforeAtomic: "1000000", afterAtomic: "500",
      }] }] },
      owner,
      blockNumber: 68851188n,
      readBalance,
    })).resolves.toEqual([
      { token, beforeAtomic: "0", afterAtomic: "1171680" },
      { token: source, beforeAtomic: "1000000", afterAtomic: "0" },
    ]);
  });
});
