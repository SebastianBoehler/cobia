import { commitment } from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { X402AuthorizationTemplateV1Schema, x402TypedDataV1 } from "./x402-authorization";
import { X402AuthorizationPlanV1Schema } from "./x402-plan";
import { confirmCommerceSettlementV1 } from "./settlement-service";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = privateKeyToAccount(hash("1"));
const placementId = "550e8400-e29b-41d4-a716-446655440077";
const asset = "0x2222222222222222222222222222222222222222";
const payee = "0x3333333333333333333333333333333333333333";
const plan = X402AuthorizationPlanV1Schema.parse({
  version: 1, chainId: 196, offerCommitment: hash("2"), policyHash: hash("3"),
  programHash: hash("4"), owner: owner.address, payee, asset, amount: "10000",
  endpoint: "https://api.example/resource", facilitator: "https://facilitator.example",
  maxTimeoutSec: 60, offerExpiresAt: 2_000_000_120, programDeadline: 2_000_000_180,
  authorizationNonce: hash("5"),
  token: { runtimeCodeHash: hash("6"), eip712Name: "USD Coin", eip712Version: "2" },
  settlement: {
    topic0: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    fromTopicIndex: 1, toTopicIndex: 2,
  },
});
const template = X402AuthorizationTemplateV1Schema.parse({
  version: 1, chainId: 196, offerCommitment: plan.offerCommitment,
  policyHash: plan.policyHash, programHash: plan.programHash, planHash: commitment(plan),
  endpoint: plan.endpoint, facilitator: plan.facilitator, resource: { url: plan.endpoint },
  accepted: {
    scheme: "exact", network: "eip155:196", amount: plan.amount, asset, payTo: payee,
    maxTimeoutSeconds: 60,
    extra: { assetTransferMethod: "eip3009", paymentFlow: "authorization", name: "USD Coin", version: "2" },
  },
  authorization: {
    from: owner.address, to: payee, value: plan.amount,
    validAfter: "2000000070", validBefore: "2000000160", nonce: plan.authorizationNonce,
  },
  typedData: {
    domain: { name: "USD Coin", version: "2", chainId: 196, verifyingContract: asset },
    types: { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" },
      { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ] }, primaryType: "TransferWithAuthorization",
    message: {
      from: owner.address, to: payee, value: plan.amount,
      validAfter: "2000000070", validBefore: "2000000160", nonce: plan.authorizationNonce,
    },
  },
});
const transactionHash = hash("7");
const settlement = {
  success: true as const, transaction: transactionHash, network: "eip155:196" as const,
  payer: owner.address, amount: plan.amount,
};

async function input() {
  return {
    placementId, plan, template, settlement,
    signature: await owner.signTypedData(x402TypedDataV1(template)),
  };
}

function dependencies(result: { accepted: boolean; errorCodes: string[]; evidence: unknown }) {
  return {
    placements: {
      read: vi.fn(async () => ({
        id: placementId, owner: owner.address.toLowerCase(), state: "submitted",
        offerCommitment: plan.offerCommitment, policyHash: plan.policyHash,
        programHash: plan.programHash, planHash: commitment(plan),
        authorizationTemplateHash: commitment(template), authorizationHash: hash("8"),
        transactionHash, updatedAt: new Date(2_000_000_200 * 1_000),
      })),
      append: vi.fn(async (event) => event),
    },
    verify: vi.fn(async () => result), nowSec: 2_000_000_200,
  };
}

describe("commerce settlement confirmation", () => {
  it("marks payment settled only after independent chain evidence succeeds", async () => {
    const evidence = { transactionHash, confirmations: "2" };
    const deps = dependencies({ accepted: true, errorCodes: [], evidence });
    const result = await confirmCommerceSettlementV1(await input(), deps);
    expect(deps.verify).toHaveBeenCalledTimes(1);
    expect(deps.placements.append).toHaveBeenCalledWith(expect.objectContaining({
      state: "confirmed", evidenceHash: commitment(evidence), transactionHash,
      observedAtSec: 2_000_000_201,
    }));
    expect(result).toMatchObject({ state: "confirmed", outcome: "payment-settled", evidence });
  });

  it("leaves an unconfirmed transaction pending and rejects commitment changes", async () => {
    const pending = dependencies({
      accepted: false, errorCodes: ["PAYMENT_SETTLEMENT_UNCONFIRMED"], evidence: null,
    });
    await expect(confirmCommerceSettlementV1(await input(), pending)).rejects.toMatchObject({ code: "SETTLEMENT_PENDING" });
    expect(pending.placements.append).not.toHaveBeenCalled();

    const changed = dependencies({ accepted: true, errorCodes: [], evidence: {} });
    await expect(confirmCommerceSettlementV1({
      ...await input(), plan: { ...plan, amount: "10001" },
    }, changed)).rejects.toMatchObject({ code: "PLACEMENT_MISMATCH" });
    expect(changed.verify).not.toHaveBeenCalled();
  });
});
