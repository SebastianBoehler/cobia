import { encodeFunctionData, erc20Abi } from "viem";
import { describe, expect, it } from "vitest";
import { exactApprovalLabel } from "./wallet-call-label";

const token = "0x2222222222222222222222222222222222222222" as const;
const spender = "0x3333333333333333333333333333333333333333" as const;

describe("exact wallet approval label", () => {
  it("shows the decoded amount instead of a generic approval", () => {
    expect(exactApprovalLabel({ to: token, data: encodeFunctionData({
      abi: erc20Abi, functionName: "approve", args: [spender, 2_348_046n],
    }) }, [{ token, symbol: "USDG", decimals: 6 }])).toEqual({
      label: "Allow exactly 2.348046 USDG", symbol: "USDG",
    });
  });
});
