import { describe, expect, it, vi } from "vitest";
import {
  authorizeCommercePlacementClientV1,
  confirmCommerceSettlementClientV1,
  prepareCommercePlacementClientV1,
} from "./placement-client";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const placementId = "550e8400-e29b-41d4-a716-446655440077";
const template = {
  version: 1, chainId: 196, offerCommitment: hash("1"), policyHash: hash("2"),
  programHash: hash("3"), planHash: hash("4"), endpoint: "https://api.example/resource",
  facilitator: "https://facilitator.example", resource: { url: "https://api.example/resource" },
  accepted: {
    scheme: "exact", network: "eip155:196", amount: "10000",
    asset: "0x2222222222222222222222222222222222222222",
    payTo: "0x3333333333333333333333333333333333333333", maxTimeoutSeconds: 60,
    extra: { assetTransferMethod: "eip3009", paymentFlow: "authorization", name: "USD Coin", version: "2" },
  },
  authorization: {
    from: "0x1111111111111111111111111111111111111111",
    to: "0x3333333333333333333333333333333333333333", value: "10000",
    validAfter: "2000000070", validBefore: "2000000160", nonce: hash("5"),
  },
  typedData: {
    domain: {
      name: "USD Coin", version: "2", chainId: 196,
      verifyingContract: "0x2222222222222222222222222222222222222222",
    },
    types: { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" },
      { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ] }, primaryType: "TransferWithAuthorization",
    message: {
      from: "0x1111111111111111111111111111111111111111",
      to: "0x3333333333333333333333333333333333333333", value: "10000",
      validAfter: "2000000070", validBefore: "2000000160", nonce: hash("5"),
    },
  },
};
const plan = {
  version: 1, chainId: 196, offerCommitment: template.offerCommitment,
  policyHash: template.policyHash, programHash: template.programHash,
  owner: template.authorization.from, payee: template.accepted.payTo,
  asset: template.accepted.asset, amount: template.accepted.amount,
  endpoint: template.endpoint, facilitator: template.facilitator, maxTimeoutSec: 60,
  offerExpiresAt: 2_000_000_120, programDeadline: 2_000_000_180,
  authorizationNonce: template.authorization.nonce,
  token: { runtimeCodeHash: hash("a"), eip712Name: "USD Coin", eip712Version: "2" },
  settlement: {
    topic0: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    fromTopicIndex: 1, toTopicIndex: 2,
  },
};
const signature = `0x${"11".repeat(65)}` as `0x${string}`;

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: { "content-type": "application/json" },
  });
}

describe("commerce wallet client", () => {
  it("prepares from canonical artifacts then signs typed data without broadcasting a transaction", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ placement: { id: placementId, state: "prepared" }, plan, authorization: template }, 201))
      .mockResolvedValueOnce(response({
        state: "submitted", transactionHash: hash("6"), authorizationHash: hash("7"),
        settlement: {
          success: true, transaction: hash("6"), network: "eip155:196",
          payer: template.authorization.from, amount: "10000",
        },
        resourceHash: hash("8"), resourceBodyBase64: "e30=",
      }, 202));
    const prepared = await prepareCommercePlacementClientV1({
      policy: {}, ownerSignature: signature, program: {}, evidence: {}, fetcher,
    });
    const wallet = { signTypedData: vi.fn(async () => signature) };
    const submitted = await authorizeCommercePlacementClientV1({ ...prepared, wallet, fetcher });
    expect(wallet.signTypedData).toHaveBeenCalledWith(expect.objectContaining({
      primaryType: "TransferWithAuthorization",
      domain: expect.objectContaining({ chainId: 196, verifyingContract: template.accepted.asset }),
      types: expect.objectContaining({
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
      }),
    }));
    expect(wallet).not.toHaveProperty("sendTransaction");
    expect(fetcher.mock.calls[1]![0]).toBe(`/api/commerce/placements/${placementId}/authorization`);
    expect(submitted).toMatchObject({ transactionHash: hash("6"), signature });
  });

  it("confirms using only public artifacts and surfaces non-success API errors", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({
      state: "confirmed", outcome: "payment-settled", transactionHash: hash("6"),
      evidence: { confirmations: "2" }, evidenceHash: hash("9"),
    }));
    await expect(confirmCommerceSettlementClientV1({
      placementId, plan, template, signature,
      settlement: {
        success: true, transaction: hash("6"), network: "eip155:196",
        payer: template.authorization.from, amount: "10000",
      }, fetcher,
    })).resolves.toMatchObject({ outcome: "payment-settled" });

    const rejected = vi.fn().mockResolvedValue(response({ code: "SETTLEMENT_PENDING", message: "wait" }, 409));
    await expect(confirmCommerceSettlementClientV1({
      placementId, plan, template, signature,
      settlement: {
        success: true, transaction: hash("6"), network: "eip155:196",
        payer: template.authorization.from, amount: "10000",
      }, fetcher: rejected,
    })).rejects.toThrow("wait");
  });
});
