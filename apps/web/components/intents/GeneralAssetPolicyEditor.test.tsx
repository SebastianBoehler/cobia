// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GeneralAssetDraftV1 } from "../../lib/intents/general-asset-draft";
import { GeneralAssetPolicyEditor } from "./GeneralAssetPolicyEditor";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const inputToken = "0x1111111111111111111111111111111111111111" as const;
const outputToken = "0x2222222222222222222222222222222222222222" as const;

function values(): GeneralAssetDraftV1 {
  return {
    kind: "general-asset-draft", templateId: "general-asset", displayGoal: "Swap tokens",
    sourceChainId: 196, destinationChainId: 1, manifestHash: hash("1"),
    input: { token: inputToken, symbol: "IN", decimals: 18, maximumAtomic: "100",
      maximumUsdE8: "50000000000", identityHash: hash("2"), valuationHash: hash("3") },
    output: { token: outputToken, symbol: "OUT", decimals: 6,
      minimumAtomic: "90", identityHash: hash("4") },
    allowedAdapters: [{ id: "lifi.route", version: 1 }, { id: "okx.dex", version: 1 }],
    limits: { maxStages: 4, maxCallsPerStage: 4, maxApprovals: 8, maxCalldataBytes: 4096,
      maxGasPerStage: "2000000", maxNativeValueUsdE8: "1000000000",
      maxBridgeFeeUsdE8: "5000000000", maxSolverFeeUsdE8: "0",
      maxConversionLossBps: 400, maxSlippageBps: 200 },
  };
}

describe("GeneralAssetPolicyEditor", () => {
  afterEach(cleanup);

  it("shows exact identities, ordered chains, adapters, and editable signed bounds", () => {
    const onChange = vi.fn();
    render(<GeneralAssetPolicyEditor owner="0x3333333333333333333333333333333333333333"
      values={values()} onChange={onChange} />);

    expect(screen.getByRole("heading", { name: "Review exact asset authority" })).toBeVisible();
    expect(screen.getByText(inputToken)).toBeVisible();
    expect(screen.getByText(outputToken)).toBeVisible();
    expect(screen.getByText("X Layer → Ethereum")).toBeVisible();
    expect(screen.getByText("lifi.route@1 → okx.dex@1")).toBeVisible();
    expect(screen.getByText("$1,000 route · $5,000 wallet / 24h · $50,000 protocol / 24h"))
      .toBeVisible();

    fireEvent.change(screen.getByLabelText("Maximum input USD-E8"), { target: { value: "75000000000" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ maximumUsdE8: "75000000000" }),
    }));
  });
});
