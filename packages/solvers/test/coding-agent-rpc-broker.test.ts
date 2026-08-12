import { describe, expect, it } from "vitest";
import { pinReadOnlyRpcRequest } from "../src/index";

describe("coding-agent read-only RPC broker", () => {
  it("pins an eth_call to the supplied X Layer block", () => {
    expect(pinReadOnlyRpcRequest({
      method: "eth_call",
      params: [{ to: "0x1111111111111111111111111111111111111111", data: "0x" }, "latest"],
    }, "0x1234")).toEqual({
      method: "eth_call",
      params: [{ to: "0x1111111111111111111111111111111111111111", data: "0x" }, "0x1234"],
    });
  });

  it.each([
    "eth_sendTransaction",
    "ETH_SENDRAWTRANSACTION",
    " wallet_sign ",
    "personal_sign",
    "eth_signTypedData_v4",
    "eth_sendTransaction\u0000",
  ])("rejects the mutation or signing method %j", (method) => {
    expect(() => pinReadOnlyRpcRequest({ method, params: [] }, "0x1234"))
      .toThrow("not available to coding agents");
  });
});
