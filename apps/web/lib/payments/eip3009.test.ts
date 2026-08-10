import { Challenge, Credential } from "@okxweb3/mpp";
import { describe, expect, it, vi } from "vitest";
import { encodeFunctionResult } from "viem";
import { authorizePayment } from "./eip3009";

const account = "0x1111111111111111111111111111111111111111";
const paymentAsset = "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c";
const solver = "0x2222222222222222222222222222222222222222";
const treasury = "0x3333333333333333333333333333333333333333";
const signature = `0x${"ef".repeat(65)}`;

const domainAbi = [{
  type: "function",
  name: "eip712Domain",
  stateMutability: "view",
  inputs: [],
  outputs: [
    { name: "fields", type: "bytes1" },
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
    { name: "salt", type: "bytes32" },
    { name: "extensions", type: "uint256[]" },
  ],
}] as const;

function paymentChallenge(): Response {
  const challenge = Challenge.serialize({
    id: "challenge-1",
    realm: "localhost:3000",
    method: "evm",
    intent: "charge",
    request: {
      amount: "100000",
      currency: paymentAsset,
      recipient: solver,
      methodDetails: {
        chainId: 1952,
        feePayer: true,
        splits: [{ amount: "10000", recipient: treasury, memo: "cobia-platform" }],
      },
    },
  });
  return new Response(null, { status: 402, headers: { "WWW-Authenticate": challenge } });
}

describe("authorizePayment", () => {
  it("reads token metadata from the public chain reader instead of the wallet", async () => {
    const walletRequest = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_signTypedData_v4") return signature;
      throw new Error(`Wallet must not handle read-only method ${method}`);
    });
    const chainRequest = vi.fn(async () => encodeFunctionResult({
      abi: domainAbi,
      functionName: "eip712Domain",
      result: ["0x0f", "USD₮0", "1", 1952n, paymentAsset, `0x${"00".repeat(32)}`, []],
    }));

    const authorization = await authorizePayment(
      paymentChallenge(),
      { account, request: walletRequest, switchChain: vi.fn().mockResolvedValue(undefined) },
      { request: chainRequest },
    );

    expect(Credential.deserialize(authorization).payload).toMatchObject({
      type: "transaction",
      authorization: { from: account, to: solver, value: "90000" },
    });
    expect(chainRequest).toHaveBeenCalledWith(1952, {
      method: "eth_call",
      params: [{ to: "0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c", data: "0x84b0196e" }, "latest"],
    });
    expect(walletRequest).toHaveBeenCalledTimes(2);
  });
});
