import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../../../apps/web/lib/adapters/registry";
import { AAVE_POOL_ABI, buildAaveWithdrawStage } from "../src/aave-position-actions";

const owner = "0x1111111111111111111111111111111111111111" as const;
const asset = PROTOCOL_REGISTRY.aaveV3.assets.USDG;

describe("Aave position actions", () => {
  it("withdraws an exact registered receipt-token amount to the owner", () => {
    const result = buildAaveWithdrawStage({ stageId: "01-aave-withdraw", owner,
      aToken: asset.aToken.address, underlying: asset.underlying.address,
      amountAtomic: "100", fetchedAt: 100, expiresAt: 130 });
    const decoded = decodeFunctionData({ abi: AAVE_POOL_ABI,
      data: result.payload.transaction.data });

    expect(decoded).toEqual({ functionName: "withdraw",
      args: [asset.underlying.address, 100n, owner] });
    expect(result.stage).toMatchObject({ sender: owner, recipient: owner,
      input: { token: asset.aToken.address.toLowerCase(), atomic: "100" },
      output: { token: asset.underlying.address.toLowerCase(), minimumAtomic: "100" },
      transaction: { target: PROTOCOL_REGISTRY.aaveV3.pool.address.toLowerCase(),
        selector: "0x69328dec", valueAtomic: "0" } });
    expect(result.stage).not.toHaveProperty("approval");
  });

  it("rejects receipt and underlying substitution", () => {
    expect(() => buildAaveWithdrawStage({ stageId: "01-aave-withdraw", owner,
      aToken: asset.aToken.address,
      underlying: "0x9999999999999999999999999999999999999999",
      amountAtomic: "100", fetchedAt: 100, expiresAt: 130 })).toThrow(/registered.*pair/i);
  });
});
