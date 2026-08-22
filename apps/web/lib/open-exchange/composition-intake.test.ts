import {
  commitment,
  solverDecisionClaimCommitmentV1,
} from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { buildCapabilityCompositionPolicyV1 } from "../intents/composition-policy";
import {
  block,
  dependencies as routeDependencies,
  usdt0,
} from "../orchestrator/capture-route-snapshot-v2.test-fixture";
import { captureCapabilityCompositionSnapshotV1 } from "./capture-composition-snapshot";
import { createOpenDecisionIntakeV1 } from "./decision-intake";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const nowSec = Number(block.timestamp) - 30;
const policy = buildCapabilityCompositionPolicyV1({
  requestId: "550e8400-e29b-41d4-a716-446655440099", owner: account.address,
  inputToken: usdt0, inputAtomic: "1000000", nonce: `0x${"11".repeat(32)}`,
  nowSec: nowSec - 30, displayGoal: "Best yield", competitionDurationSec: 300,
  deadlineDurationSec: 600, maxConversionLossBps: 100,
  minimumReceiptValueBps: 9_900, horizonDays: 30, forbiddenTargets: [],
});

describe("composition decision intake", () => {
  it("uses the frozen route anchor for a signed composition abstention", async () => {
    const snapshot = await captureCapabilityCompositionSnapshotV1(policy, {
      route: routeDependencies(), getGasPrice: async () => 1_000_000_000n,
      getNativeToken: async () => ({ chainId: 196,
        token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        symbol: "OKB", decimals: 18, priceUsd: "107.41" }),
    });
    const decision = { version: 1 as const, decision: "abstain" as const,
      reasonCode: "NO_POSITIVE_ROUTE" };
    const claim = { version: 1 as const, solverId: "alpha-solver",
      intentId: policy.requestId, revision: 1, decisionHash: commitment(decision),
      snapshotHash: commitment(snapshot), nonce: `0x${"55".repeat(32)}` as const,
      issuedAt: nowSec - 1, expiresAt: nowSec + 120 };
    const signature = await account.signMessage({
      message: { raw: solverDecisionClaimCommitmentV1(claim) },
    });
    const createRun = vi.fn(async () => ({ id: policy.requestId }));
    const abstain = vi.fn();
    const intake = createOpenDecisionIntakeV1({
      intents: { get: async () => ({ policy, state: "collecting" }) },
      snapshots: { get: async () => ({ snapshot, snapshotHash: commitment(snapshot) }) },
      profiles: { identity: async () => ({ id: "alpha-solver", operatorKind: "community",
        attestationAddress: account.address, declaredCapabilities: [] }) },
      claims: { consume: vi.fn() },
      runs: { create: createRun, start: vi.fn(), complete: vi.fn(), abstain, fail: vi.fn() },
      submissions: { append: vi.fn(), appendArtifact: vi.fn(), resolve: vi.fn() } as never,
      verify: vi.fn(), nowSec: () => nowSec,
    });

    await expect(intake.submit({ claim, signature, decision })).resolves.toMatchObject({
      state: "abstained",
    });
    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      blockNumber: snapshot.route.blockNumber, blockHash: snapshot.route.blockHash,
    }));
    expect(abstain).toHaveBeenCalledOnce();
  });
});
