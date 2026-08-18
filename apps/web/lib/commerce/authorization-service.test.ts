import { commitment } from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { X402AuthorizationTemplateV1Schema, x402TypedDataV1 } from "./x402-authorization";
import { authorizeCommercePlacementV1 } from "./authorization-service";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = privateKeyToAccount(hash("1"));
const placementId = "550e8400-e29b-41d4-a716-446655440077";
const template = X402AuthorizationTemplateV1Schema.parse({
  version: 1, chainId: 196, offerCommitment: hash("2"), policyHash: hash("3"),
  programHash: hash("4"), planHash: hash("5"), endpoint: "https://api.example/resource",
  facilitator: "https://facilitator.example", resource: { url: "https://api.example/resource" },
  accepted: {
    scheme: "exact", network: "eip155:196", amount: "10000",
    asset: "0x2222222222222222222222222222222222222222",
    payTo: "0x3333333333333333333333333333333333333333", maxTimeoutSeconds: 60,
    extra: { assetTransferMethod: "eip3009", paymentFlow: "authorization", name: "USD Coin", version: "2" },
  },
  authorization: {
    from: owner.address, to: "0x3333333333333333333333333333333333333333", value: "10000",
    validAfter: "2000000070", validBefore: "2000000160", nonce: hash("6"),
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
    ] },
    primaryType: "TransferWithAuthorization",
    message: {
      from: owner.address, to: "0x3333333333333333333333333333333333333333", value: "10000",
      validAfter: "2000000070", validBefore: "2000000160", nonce: hash("6"),
    },
  },
});
const root = {
  id: placementId, owner: owner.address.toLowerCase(), state: "prepared", sequence: 1,
  offerCommitment: template.offerCommitment, policyHash: template.policyHash,
  programHash: template.programHash, planHash: template.planHash,
  authorizationTemplateHash: commitment(template),
  updatedAt: new Date(2_000_000_100 * 1_000),
};

async function input() {
  return { placementId, template, signature: await owner.signTypedData(x402TypedDataV1(template)) };
}

function dependencies(placement: unknown = root) {
  return {
    nowSec: 2_000_000_100,
    placements: {
      read: vi.fn(async () => placement),
      append: vi.fn(async (event) => ({ ...root, ...event })),
    },
    execute: vi.fn(async () => ({
      settlement: {
        success: true, transaction: hash("7"), network: "eip155:196",
        payer: owner.address.toLowerCase(), amount: "10000",
      },
      authorizationHash: hash("8"), resourceHash: hash("9"),
      resourceBody: new TextEncoder().encode('{"result":"paid"}'),
    })),
  };
}

describe("commerce authorization service", () => {
  it("persists authorization before a single paid request and then records submission", async () => {
    const deps = dependencies();
    const value = await input();
    const expectedAuthorizationHash = commitment({
      templateHash: commitment(template), signature: value.signature.toLowerCase(),
    });
    deps.execute.mockResolvedValueOnce({
      settlement: {
        success: true, transaction: hash("7"), network: "eip155:196",
        payer: owner.address.toLowerCase(), amount: "10000",
      },
      authorizationHash: expectedAuthorizationHash,
      resourceHash: hash("9"), resourceBody: new TextEncoder().encode('{"result":"paid"}'),
    } as never);
    const result = await authorizeCommercePlacementV1(value, deps);
    expect(deps.placements.append.mock.calls).toEqual([
      [expect.objectContaining({ state: "authorizing", authorizationHash: expectedAuthorizationHash, observedAtSec: 2_000_000_101 })],
      [expect.objectContaining({ state: "submitted", transactionHash: hash("7"), observedAtSec: 2_000_000_102 })],
    ]);
    expect(deps.execute).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ state: "submitted", transactionHash: hash("7"), resourceHash: hash("9") });
    expect(Buffer.from(result.resourceBodyBase64, "base64").toString()).toBe('{"result":"paid"}');
  });

  it("rejects altered templates and never retries an attempted authorization", async () => {
    const altered = dependencies({ ...root, authorizationTemplateHash: hash("a") });
    await expect(authorizeCommercePlacementV1(await input(), altered)).rejects.toMatchObject({ code: "PLACEMENT_MISMATCH" });
    expect(altered.execute).not.toHaveBeenCalled();

    const attempted = dependencies({ ...root, state: "authorizing", authorizationHash: hash("b") });
    await expect(authorizeCommercePlacementV1(await input(), attempted)).rejects.toMatchObject({ code: "SETTLEMENT_ALREADY_ATTEMPTED" });
    expect(attempted.execute).not.toHaveBeenCalled();
  });

  it("keeps an ambiguous paid request in authorizing state instead of retrying", async () => {
    const deps = dependencies();
    deps.execute.mockRejectedValueOnce(new Error("connection closed"));
    await expect(authorizeCommercePlacementV1(await input(), deps)).rejects.toMatchObject({ code: "SETTLEMENT_UNCERTAIN" });
    expect(deps.placements.append).toHaveBeenCalledTimes(1);
    expect(deps.placements.append).toHaveBeenCalledWith(expect.objectContaining({ state: "authorizing" }));
  });

  it("rejects an expired wallet authorization before changing state", async () => {
    const deps = { ...dependencies(), nowSec: Number(template.authorization.validBefore) };
    await expect(authorizeCommercePlacementV1(await input(), deps)).rejects.toMatchObject({ code: "AUTHORIZATION_EXPIRED" });
    expect(deps.placements.append).not.toHaveBeenCalled();
    expect(deps.execute).not.toHaveBeenCalled();
  });
});
