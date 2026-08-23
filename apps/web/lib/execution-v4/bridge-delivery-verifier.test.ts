import { describe, expect, it, vi } from "vitest";
import { verifyBridgeDeliveryV4, type BridgeDeliveryVerificationInputV4 } from "./bridge-delivery-verifier";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const recipient = "0x1111111111111111111111111111111111111111" as const;
const token = "0x2222222222222222222222222222222222222222" as const;
const messageId = hash("3");
const sourceTransactionHash = hash("4");
const deliveryTransactionHash = hash("5");
const emitter = "0x4444444444444444444444444444444444444444" as const;

function fixture(): BridgeDeliveryVerificationInputV4 {
  return {
    expected: { sourceChainId: 196, sourceTransactionHash, destinationChainId: 1,
      recipient, token, minimumAtomic: "100", requiredConfirmations: 2 },
    sourceReceipt: { transactionHash: sourceTransactionHash, success: true,
      blockNumber: "100", blockHash: hash("6"), transactionIndex: 1, logs: [] },
    locator: { sourceTransactionHash, destinationChainId: 1, messageId, deliveryTransactionHash },
    semantics: {
      sourceMessageId: vi.fn(() => messageId),
      destinationDelivery: vi.fn(() => ({ messageId, recipient, token, amountAtomic: "100",
        emitter, emitterRuntimeCodeHash: hash("8") })),
    },
    reader: {
      receipt: vi.fn(async () => ({ transactionHash: deliveryTransactionHash, success: true,
        blockNumber: "200", blockHash: hash("7"), transactionIndex: 2, logs: [] })),
      canonicalBlockHash: vi.fn(async (chainId) => chainId === 196 ? hash("6") : hash("7")),
      currentBlockNumber: vi.fn(async () => "201"),
      tokenBalance: vi.fn(async (_chainId, _token, _owner, block) => block === "199" ? "50" : "150"),
      codeHash: vi.fn(async () => hash("8")),
    },
  };
}

describe("verified V4 bridge delivery", () => {
  it("accepts one exact canonical finalized source-to-destination delivery", async () => {
    await expect(verifyBridgeDeliveryV4(fixture())).resolves.toMatchObject({
      status: "verified",
      evidence: { messageId, sourceTransactionHash, destinationChainId: 1, recipient, token,
        amountAtomic: "100", deliveryTransactionHash, sourceBlockHash: hash("6"),
        destinationBlockHash: hash("7") },
    });
  });

  it("keeps a finalized source pending while no destination delivery exists", async () => {
    const input = fixture(); input.locator = undefined;
    await expect(verifyBridgeDeliveryV4(input)).resolves.toEqual({ status: "pending" });
  });

  it.each([
    ["wrong source", (input: BridgeDeliveryVerificationInputV4) => {
      input.locator = { ...input.locator!, sourceTransactionHash: hash("a") };
    }],
    ["wrong chain", (input: BridgeDeliveryVerificationInputV4) => {
      input.locator = { ...input.locator!, destinationChainId: 196 };
    }],
    ["wrong message", (input: BridgeDeliveryVerificationInputV4) => {
      input.semantics.destinationDelivery = () => ({ messageId: hash("a"), recipient, token,
        amountAtomic: "100", emitter, emitterRuntimeCodeHash: hash("8") });
    }],
    ["wrong recipient", (input: BridgeDeliveryVerificationInputV4) => {
      input.semantics.destinationDelivery = () => ({ messageId,
        recipient: "0x3333333333333333333333333333333333333333", token, amountAtomic: "100",
        emitter, emitterRuntimeCodeHash: hash("8") });
    }],
    ["wrong token", (input: BridgeDeliveryVerificationInputV4) => {
      input.semantics.destinationDelivery = () => ({ messageId, recipient,
        token: "0x3333333333333333333333333333333333333333", amountAtomic: "100",
        emitter, emitterRuntimeCodeHash: hash("8") });
    }],
    ["short amount", (input: BridgeDeliveryVerificationInputV4) => {
      input.semantics.destinationDelivery = () => ({ messageId, recipient, token, amountAtomic: "99",
        emitter, emitterRuntimeCodeHash: hash("8") });
    }],
  ])("rejects %s attribution", async (_name, change) => {
    const input = fixture(); change(input);
    await expect(verifyBridgeDeliveryV4(input)).resolves.toEqual({
      status: "reconciliation_required", code: "BRIDGE_DELIVERY_MISMATCH",
    });
  });

  it("rejects source and destination reorgs", async () => {
    const source = fixture(); source.reader.canonicalBlockHash = vi.fn(async (chainId) =>
      chainId === 196 ? hash("a") : hash("7"));
    await expect(verifyBridgeDeliveryV4(source)).resolves.toEqual({
      status: "reconciliation_required", code: "BRIDGE_SOURCE_REORGED",
    });
    const destination = fixture(); destination.reader.canonicalBlockHash = vi.fn(async (chainId) =>
      chainId === 1 ? hash("a") : hash("6"));
    await expect(verifyBridgeDeliveryV4(destination)).resolves.toEqual({
      status: "reconciliation_required", code: "BRIDGE_DESTINATION_REORGED",
    });
  });

  it("rejects a duplicate locator that changes the destination transaction", async () => {
    const input = fixture(); input.locator = { ...input.locator!, deliveryTransactionHash: hash("a") };
    const receipt = input.reader.receipt;
    input.reader.receipt = vi.fn(async (chainId, transactionHash) =>
      receipt(chainId, transactionHash === hash("a") ? deliveryTransactionHash : transactionHash));
    await expect(verifyBridgeDeliveryV4(input)).resolves.toEqual({
      status: "reconciliation_required", code: "BRIDGE_DELIVERY_MISMATCH",
    });
  });
});
