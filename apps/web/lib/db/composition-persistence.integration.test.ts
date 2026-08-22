import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCapabilityCompositionPolicyV1 } from "../intents/composition-policy";
import { captureCapabilityCompositionSnapshotV1 } from "../open-exchange/capture-composition-snapshot";
import {
  block,
  dependencies,
  usdt0,
} from "../orchestrator/capture-route-snapshot-v2.test-fixture";
import { startIntegrationDatabase } from "./integration-database";
import { createIntentRepository } from "./intents";
import { createOpenIntentSnapshotRepository } from "./open-intent-snapshots";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;
const nowSec = Number(block.timestamp) - 60;
const policy = buildCapabilityCompositionPolicyV1({
  requestId: "550e8400-e29b-41d4-a716-446655440099",
  owner: "0x1111111111111111111111111111111111111111",
  inputToken: usdt0, inputAtomic: "1000000", nonce: `0x${"11".repeat(32)}`,
  nowSec, displayGoal: "Best registered stablecoin yield",
  competitionDurationSec: 300, deadlineDurationSec: 600,
  maxConversionLossBps: 100, minimumReceiptValueBps: 9_900,
  horizonDays: 30, forbiddenTargets: [],
});

function db() {
  if (!database) throw new Error("Integration database did not start");
  return database.db;
}

beforeAll(async () => { database = await startIntegrationDatabase(); });
afterAll(async () => { await database?.close(); });

describe("composition persistence", () => {
  it("stores and discovers a signed policy with its exact frozen snapshot", async () => {
    const snapshot = await captureCapabilityCompositionSnapshotV1(policy, {
      route: dependencies(), getGasPrice: async () => 1_000_000_000n,
      getNativeToken: async () => ({ chainId: 196,
        token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        symbol: "OKB", decimals: 18, priceUsd: "107.41" }),
    });
    await createIntentRepository(db()).create({
      policy, ownerSignature: `0x${"44".repeat(65)}`,
    });
    await createOpenIntentSnapshotRepository(db()).create(snapshot);

    await expect(createIntentRepository(db()).listDiscoverWithSnapshots(nowSec))
      .resolves.toEqual([expect.objectContaining({
        intent: expect.objectContaining({ policy }),
        snapshot: expect.objectContaining({ snapshot }),
      })]);
  });
});
