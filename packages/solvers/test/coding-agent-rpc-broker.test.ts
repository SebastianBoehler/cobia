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

  it("pins every state and log read needed by an isolated Anvil fork", () => {
    expect(pinReadOnlyRpcRequest({
      method: "eth_getLogs", params: [{ fromBlock: "0x1", toBlock: "latest" }],
    }, "0x1234")).toEqual({
      method: "eth_getlogs", params: [{ fromBlock: "0x1234", toBlock: "0x1234" }],
    });
    expect(pinReadOnlyRpcRequest({
      method: "eth_getTransactionCount", params: ["0x1111111111111111111111111111111111111111", "pending"],
    }, "0x1234")).toEqual({
      method: "eth_gettransactioncount",
      params: ["0x1111111111111111111111111111111111111111", "0x1234"],
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
