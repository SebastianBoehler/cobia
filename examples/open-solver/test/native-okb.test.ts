import { NATIVE_ASSET_ADDRESS } from "@cobia/domain";
import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import {
  WOKB_ABI,
  XLAYER_WOKB,
  buildNativeOkbStage,
} from "../src/native-okb";

const owner = "0x1111111111111111111111111111111111111111" as const;

describe("native OKB transaction stages", () => {
  it("binds the official X Layer WOKB identity and exact wrap value", () => {
    expect(XLAYER_WOKB).toEqual({
      chainId: 196,
      address: "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
      runtimeCodeHash: "0xde187307e119db7066ef4d8d154ba1617313e4c9a410c70378abe475cd2cffd2",
    });

    const result = buildNativeOkbStage({
      stageId: "01-wrap-okb", owner, inputToken: NATIVE_ASSET_ADDRESS,
      outputToken: XLAYER_WOKB.address, amountAtomic: "100", fetchedAt: 100,
      expiresAt: 130,
    });

    expect(result.stage).toMatchObject({
      sender: owner, recipient: owner,
      input: { token: NATIVE_ASSET_ADDRESS, atomic: "100" },
      output: { token: XLAYER_WOKB.address, minimumAtomic: "100" },
      transaction: { target: XLAYER_WOKB.address, selector: "0xd0e30db0", valueAtomic: "100" },
    });
    expect(result.stage).not.toHaveProperty("approval");
    expect(result.payload).toMatchObject({
      provider: "evm.raw@1",
      transaction: { from: owner, to: XLAYER_WOKB.address, data: "0xd0e30db0", valueAtomic: "100" },
    });
  });

  it("unwraps the exact WOKB amount to the owner without approval or native value", () => {
    const result = buildNativeOkbStage({
      stageId: "01-unwrap-okb", owner, inputToken: XLAYER_WOKB.address,
      outputToken: NATIVE_ASSET_ADDRESS, amountAtomic: "77", fetchedAt: 100,
      expiresAt: 130, dependsOn: ["01-okx-swap"],
    });
    const decoded = decodeFunctionData({ abi: WOKB_ABI,
      data: result.payload.transaction.data });

    expect(decoded).toEqual({ functionName: "withdraw", args: [77n] });
    expect(result.stage).toMatchObject({
      recipient: owner, dependsOn: ["01-okx-swap"],
      output: { token: NATIVE_ASSET_ADDRESS, minimumAtomic: "77" },
      transaction: { target: XLAYER_WOKB.address, selector: "0x2e1a7d4d", valueAtomic: "0" },
    });
    expect(result.stage).not.toHaveProperty("approval");
  });

  it("rejects noncanonical assets and invalid time bounds", () => {
    expect(() => buildNativeOkbStage({
      stageId: "01-wrap-okb", owner,
      inputToken: "0x2222222222222222222222222222222222222222",
      outputToken: XLAYER_WOKB.address, amountAtomic: "1", fetchedAt: 100, expiresAt: 130,
    })).toThrow(/native OKB pair/i);
    expect(() => buildNativeOkbStage({
      stageId: "01-wrap-okb", owner, inputToken: NATIVE_ASSET_ADDRESS,
      outputToken: XLAYER_WOKB.address, amountAtomic: "1", fetchedAt: 130, expiresAt: 130,
    })).toThrow(/expiry/i);
  });
});
