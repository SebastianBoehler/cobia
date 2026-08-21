import { commitment } from "@cobia/domain";
import { encodeFunctionData, padHex, parseSignature, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  X402AuthorizationTemplateV1Schema,
  x402TypedDataV1,
} from "./x402-authorization";
import { ERC20_TRANSFER_TOPIC0 } from "./merchant-manifest";
import { X402AuthorizationPlanV1Schema } from "./x402-plan";
import { verifyX402SettlementReceiptV1 } from "./x402-receipt-verifier";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const account = privateKeyToAccount(hash("1"));
const asset = "0x2222222222222222222222222222222222222222";
const payee = "0x3333333333333333333333333333333333333333";
const authorization = {
  from: account.address, to: payee, value: "10000", validAfter: "2000000070",
  validBefore: "2000000160", nonce: hash("2"),
};
const plan = X402AuthorizationPlanV1Schema.parse({
  version: 1, chainId: 196, offerCommitment: hash("3"), policyHash: hash("4"), programHash: hash("5"),
  owner: account.address, payee, asset, amount: "10000",
  endpoint: "https://api.example/resource", facilitator: "https://facilitator.example",
  maxTimeoutSec: 60, offerExpiresAt: 2_000_000_200, programDeadline: 2_000_000_300,
  authorizationNonce: hash("2"),
  token: { runtimeCodeHash: hash("6"), eip712Name: "USD Coin", eip712Version: "2" },
  settlement: { topic0: ERC20_TRANSFER_TOPIC0, fromTopicIndex: 1, toTopicIndex: 2 },
});
const template = X402AuthorizationTemplateV1Schema.parse({
  version: 1, chainId: 196, offerCommitment: plan.offerCommitment, policyHash: plan.policyHash,
  programHash: plan.programHash, planHash: commitment(plan), endpoint: plan.endpoint,
  facilitator: plan.facilitator, resource: { url: plan.endpoint },
  accepted: {
    scheme: "exact", network: "eip155:196", amount: plan.amount, asset, payTo: payee,
    maxTimeoutSeconds: 60,
    extra: { name: "USD Coin", version: "2" },
  },
  authorization,
  typedData: {
    domain: { name: "USD Coin", version: "2", chainId: 196, verifyingContract: asset },
    types: { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" },
      { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ] },
    primaryType: "TransferWithAuthorization", message: authorization,
  },
});

async function fixture() {
  const signature = await account.signTypedData(x402TypedDataV1(template));
  const parsed = parseSignature(signature);
  const transactionHash = hash("7");
  const blockHash = hash("8");
  const input = encodeFunctionData({
    abi: [{
      type: "function", name: "transferWithAuthorization", stateMutability: "nonpayable",
      inputs: [
        { name: "from", type: "address" }, { name: "to", type: "address" },
        { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
        { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" },
      ], outputs: [],
    }] as const,
    functionName: "transferWithAuthorization",
    args: [account.address, payee, 10_000n, 2_000_000_070n, 2_000_000_160n, hash("2"), Number(parsed.v), parsed.r, parsed.s],
  });
  return {
    signature,
    settlement: { success: true, transaction: transactionHash, network: "eip155:196", payer: account.address, amount: "10000" },
    transaction: {
      hash: transactionHash, to: asset, input, blockNumber: "123456", blockHash,
      blockTimestampSec: 2_000_000_100,
    },
    receipt: {
      transactionHash, status: "success", blockNumber: "123456", blockHash,
      logs: [{
        address: asset,
        topics: [ERC20_TRANSFER_TOPIC0, padHex(account.address, { size: 32 }), padHex(payee, { size: 32 })],
        data: padHex(toHex(10_000n), { size: 32 }),
      }],
    },
  };
}

describe("x402 settlement receipt verifier", () => {
  it("accepts only the exact EIP-3009 call, transfer log, code, and canonical block", async () => {
    const evidence = await fixture();
    await expect(verifyX402SettlementReceiptV1({
      plan, template, ...evidence, latestBlockNumber: "123460", minimumConfirmations: 3,
      confirmAnchor: async () => true, readCodeHash: async () => hash("6"),
    })).resolves.toMatchObject({ accepted: true, errorCodes: [], evidence: { transactionHash: hash("7") } });
  });

  it("rejects target, calldata, log, code, confirmation, and reorg mismatches", async () => {
    const evidence = await fixture();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ transaction: { ...evidence.transaction, to: payee } }, "PAYMENT_SETTLEMENT_MISMATCH"],
      [{ transaction: { ...evidence.transaction, input: "0x12345678" } }, "PAYMENT_SETTLEMENT_MISMATCH"],
      [{ receipt: { ...evidence.receipt, logs: [] } }, "PAYMENT_TRANSFER_MISSING"],
      [{ readCodeHash: async () => hash("9") }, "TARGET_CODE_MISMATCH"],
      [{ latestBlockNumber: "123456" }, "PAYMENT_SETTLEMENT_UNCONFIRMED"],
      [{ confirmAnchor: async () => false }, "PAYMENT_SETTLEMENT_REORGED"],
    ];
    for (const [override, code] of cases) {
      const result = await verifyX402SettlementReceiptV1({
        plan, template, ...evidence, latestBlockNumber: "123460", minimumConfirmations: 3,
        confirmAnchor: async () => true, readCodeHash: async () => hash("6"), ...override,
      });
      expect(result.accepted, code).toBe(false);
      expect(result.errorCodes, code).toContain(code);
    }
  });
});
