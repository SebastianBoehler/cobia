import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startIntegrationDatabase } from "./integration-database";
import { createGeneralAssetExecutionRepository } from "./general-asset-executions";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x189c40caad72812b8c6fb0df96582826b3738fa3" as const;
const target = "0x779ded0c9e1022225f8e0630b35a9b54be713736" as const;
const inputToken = "0x74d2f3c2f0bde8da40040dd9d6f52176d0cb2418" as const;
const outputToken = "0x4b9a2299a868785b21e67d787b901ca2f6ee8f8c" as const;

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

function program(byte: string) {
  return {
    programId: hash(byte),
    canonicalProgramHash: hash(byte),
    owner,
    finalOutput: { chainId: 1 as const, token: outputToken, minimumAtomic: "100" },
  };
}

function firstStage(byte: string, programId: `0x${string}`) {
  return {
    programId,
    stageId: hash(byte),
    ordinal: 0,
    chainId: 196 as const,
    predecessorStageId: null,
    sender: owner,
    inputToken,
    target,
    valueAtomic: "0",
    calldata: "0x12345678" as const,
    expectedNonce: "7",
    requiredConfirmations: 2,
    expectedLogs: [{ address: target, topics: [hash("a")], data: "0x" as const }],
    delivery: {
      kind: "bridge" as const,
      destinationChainId: 1 as const,
      recipient: owner,
      token: outputToken,
      minimumAtomic: "100",
    },
  };
}

function receipt(transactionHash: `0x${string}`, chainId = 196) {
  return {
    chainId,
    transactionHash,
    sender: owner,
    nonce: "7",
    target,
    valueAtomic: "0",
    calldata: "0x12345678" as const,
    success: true,
    blockNumber: "100",
    blockHash: hash("b"),
    transactionIndex: 1,
    logs: [{ address: target, topics: [hash("a")], data: "0x" as const }],
  };
}

beforeAll(async () => {
  database = await startIntegrationDatabase();
});

afterAll(async () => {
  await database?.close();
});

describe("general asset V4 durable coordinator", () => {
  it("applies the V4 migration cleanly over the prior production schema", async () => {
    const upgrade = await startIntegrationDatabase({
      throughMigration: "0021_capability_composition",
    });
    try {
      await upgrade.applyMigration("0022_general_asset_v4");
      const metadata = program("b");
      await expect(createGeneralAssetExecutionRepository(upgrade.db).prepareStage({
        program: metadata,
        stage: firstStage("c", metadata.programId),
      })).resolves.toMatchObject({ state: "prepared" });
    } finally {
      await upgrade.close();
    }
  });

  it("persists broadcasting before submission and makes retries exact", async () => {
    const repository = createGeneralAssetExecutionRepository(db());
    const metadata = program("1");
    const stage = firstStage("2", metadata.programId);
    const prepared = await repository.prepareStage({ program: metadata, stage });
    expect(await repository.prepareStage({ program: metadata, stage })).toEqual(prepared);
    await expect(repository.recordSubmission(metadata.programId, stage.stageId, hash("3")))
      .rejects.toThrow("armed");

    const armed = await repository.armStage(metadata.programId, stage.stageId);
    expect(armed.state).toBe("broadcasting");
    expect(await repository.armStage(metadata.programId, stage.stageId)).toEqual(armed);
    const submitted = await repository.recordSubmission(metadata.programId, stage.stageId, hash("3"));
    expect(submitted.state).toBe("submitted");
    expect(await repository.recordSubmission(metadata.programId, stage.stageId, hash("3")))
      .toEqual(submitted);
  });

  it("gates the next chain on finality and exact bridge delivery", async () => {
    const repository = createGeneralAssetExecutionRepository(db());
    const metadata = program("4");
    const source = firstStage("5", metadata.programId);
    await repository.prepareStage({ program: metadata, stage: source });
    await repository.armStage(metadata.programId, source.stageId);
    const transactionHash = hash("6");
    await repository.recordSubmission(metadata.programId, source.stageId, transactionHash);

    const pending = await repository.reconcileStageReceipt(metadata.programId, source.stageId, {
      observed: receipt(transactionHash), currentBlockNumber: "100", canonicalBlockHash: hash("b"),
    });
    expect(pending.state).toBe("submitted");
    const finalized = await repository.reconcileStageReceipt(metadata.programId, source.stageId, {
      observed: receipt(transactionHash), currentBlockNumber: "101", canonicalBlockHash: hash("b"),
    });
    expect(finalized.state).toBe("finalized");

    const destination = {
      ...firstStage("7", metadata.programId),
      ordinal: 1,
      chainId: 1 as const,
      predecessorStageId: source.stageId,
      inputToken: outputToken,
      expectedNonce: "11",
      delivery: { kind: "none" as const },
    };
    await expect(repository.prepareStage({ program: metadata, stage: destination }))
      .rejects.toThrow("predecessor");
    const delivery = {
      messageId: hash("8"), sourceTransactionHash: transactionHash,
      destinationChainId: 1 as const, recipient: owner, token: outputToken,
      amountAtomic: "100", deliveryTransactionHash: hash("9"),
    };
    expect((await repository.recordBridgeDelivery(metadata.programId, source.stageId, delivery)).state)
      .toBe("delivered");
    expect(await repository.recordBridgeDelivery(metadata.programId, source.stageId, delivery))
      .toMatchObject({ state: "delivered" });
    await expect(repository.prepareStage({ program: metadata, stage: destination }))
      .resolves.toMatchObject({ state: "prepared", ordinal: 1 });
    await repository.armStage(metadata.programId, destination.stageId);
    const destinationHash = hash("4");
    await repository.recordSubmission(metadata.programId, destination.stageId, destinationHash);
    const confirmed = await repository.reconcileStageReceipt(
      metadata.programId,
      destination.stageId,
      {
        observed: { ...receipt(destinationHash, 1), nonce: "11" },
        currentBlockNumber: "101",
        canonicalBlockHash: hash("b"),
        output: {
          expected: { token: outputToken, minimumIncreaseAtomic: "100" },
          observed: { token: outputToken, beforeAtomic: "50", afterAtomic: "150" },
        },
      },
    );
    expect(confirmed.state).toBe("confirmed");
    expect(await repository.getProgram(metadata.programId))
      .toMatchObject({ state: "confirmed", stages: [{ state: "delivered" }, { state: "confirmed" }] });
    await expect(repository.prepareStage({ program: metadata, stage: destination }))
      .resolves.toMatchObject({ state: "confirmed" });
    await expect(repository.recordSubmission(metadata.programId, destination.stageId, destinationHash))
      .resolves.toMatchObject({ state: "confirmed" });

    const reorged = await repository.reconcileStageReceipt(metadata.programId, destination.stageId, {
      observed: { ...receipt(destinationHash, 1), nonce: "11" },
      currentBlockNumber: "102",
      canonicalBlockHash: hash("c"),
      output: {
        expected: { token: outputToken, minimumIncreaseAtomic: "100" },
        observed: { token: outputToken, beforeAtomic: "50", afterAtomic: "150" },
      },
    });
    expect(reorged.state).toBe("reconciliation_required");
    expect(await repository.getProgram(metadata.programId))
      .toMatchObject({ state: "reconciliation_required", completedAt: null });
  });

  it("freezes the whole program on attribution mismatch or a later reorg", async () => {
    const repository = createGeneralAssetExecutionRepository(db());
    const metadata = program("c");
    const stage = firstStage("d", metadata.programId);
    await repository.prepareStage({ program: metadata, stage });
    await repository.armStage(metadata.programId, stage.stageId);
    const transactionHash = hash("e");
    await repository.recordSubmission(metadata.programId, stage.stageId, transactionHash);
    const mismatch = await repository.reconcileStageReceipt(metadata.programId, stage.stageId, {
      observed: receipt(transactionHash, 1), currentBlockNumber: "101", canonicalBlockHash: hash("b"),
    });
    expect(mismatch).toMatchObject({ state: "reconciliation_required", failureCode: "CHAIN_MISMATCH" });
    await expect(repository.armStage(metadata.programId, stage.stageId))
      .rejects.toThrow("manual reconciliation");

    const other = program("f");
    const otherStage = firstStage("a", other.programId);
    await repository.prepareStage({ program: other, stage: otherStage });
    await repository.armStage(other.programId, otherStage.stageId);
    const otherHash = hash("7");
    await repository.recordSubmission(other.programId, otherStage.stageId, otherHash);
    await repository.reconcileStageReceipt(other.programId, otherStage.stageId, {
      observed: receipt(otherHash), currentBlockNumber: "101", canonicalBlockHash: hash("b"),
    });
    const reorged = await repository.reconcileStageReceipt(other.programId, otherStage.stageId, {
      observed: receipt(otherHash), currentBlockNumber: "102", canonicalBlockHash: hash("c"),
    });
    expect(reorged).toMatchObject({ state: "reconciliation_required", failureCode: "RECEIPT_REORGED" });
  });
});
