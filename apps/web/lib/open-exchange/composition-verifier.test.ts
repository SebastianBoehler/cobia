import { commitment, type CapabilityCompositionSnapshotV1 } from "@cobia/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";
import { buildCapabilityCompositionPolicyV1 } from "../intents/composition-policy";

const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("./capability-verifier-core", () => ({
  verifyDerivedCapabilityProposalV1: mocks.verify,
}));
import { verifyCompositionProposalV1 } from "./composition-verifier";

const usdg = PROTOCOL_REGISTRY.aaveV3.assets.USDG;
const usdt0 = PROTOCOL_REGISTRY.aaveV3.assets.USDt0;
const requestId = "550e8400-e29b-41d4-a716-446655440099";
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const policy = buildCapabilityCompositionPolicyV1({
  requestId, owner: "0x1111111111111111111111111111111111111111",
  inputToken: usdg.underlying.address, inputAtomic: "1000000", nonce: hash("1"),
  nowSec: 2_000_000_000, displayGoal: "Best yield", competitionDurationSec: 300,
  deadlineDurationSec: 600, maxConversionLossBps: 100,
  minimumReceiptValueBps: 9_900, horizonDays: 30, forbiddenTargets: [],
});
const capturedAt = "2033-05-18T03:33:30.000Z";
const snapshot: CapabilityCompositionSnapshotV1 = {
  version: 1, kind: "capability-composition", requestId, capturedAt,
  manifestHash: commitment(productionCapabilityManifestV1()),
  route: { version: 2, requestId, chainId: 196, blockNumber: "70000000",
    blockHash: hash("2"), capturedAt, adapterRegistryHash: registryHash,
    scannedAdapters: ["aave-v3@1", "curve-stableswap-ng@1"],
    valuations: [
      { asset: usdg.underlying.address, decimals: 6, priceUsdE8: "100000000" },
      { asset: usdt0.underlying.address, decimals: 6, priceUsdE8: "100000000" },
    ].sort((a, b) => a.asset.toLowerCase().localeCompare(b.asset.toLowerCase())),
    opportunities: [{ id: "curve", kind: "curve-stableswap-ng-exact-input",
      adapterId: "curve-stableswap-ng@1", pool: PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address,
      tokenIn: usdg.underlying.address, tokenOut: usdt0.underlying.address,
      inputIndex: 0, outputIndex: 1, fee: "1", quotedInputAtomic: "1000000",
      quotedOutputAtomic: "999000" },
    { id: "aave", kind: "aave-v3-supply", adapterId: "aave-v3@1",
      asset: usdt0.underlying.address, supplyRateBps: 500, tvlUsdE6: "1",
      availableLiquidityAtomic: "100000000", validatedSupplyAtomic: "999000" }] },
  gas: { priceAtomic: "1000000000", nativePriceUsdE8: "10741000000" },
};
const program = {
  version: 2 as const, kind: "general-onchain" as const, requestId, chainId: 196 as const,
  policyHash: hash("3"), manifestHash: policy.manifestHash, owner: policy.owner,
  executor: "0x3333333333333333333333333333333333333333", pinnedBlock: {
    number: snapshot.route.blockNumber, hash: snapshot.route.blockHash },
  deadline: policy.deadline, nonce: policy.nonce,
  input: { token: policy.input.token, atomic: "1000000" },
  actions: [{ capabilityId: "curve-stableswap-ng.exact-input", capabilityVersion: 1,
    valueAtomic: "0", parameters: { tokenIn: usdg.underlying.address,
      tokenOut: usdt0.underlying.address, amountInAtomic: "1000000",
      minimumOutputAtomic: "999000" } },
  { capabilityId: "aave-v3.supply", capabilityVersion: 1, valueAtomic: "0",
    parameters: { asset: usdt0.underlying.address, amountAtomic: "999000" } }],
  balanceConstraints: [{ kind: "minimumIncrease", token: usdt0.aToken.address,
    atomic: "998999" }], predicates: [], objective: { kind: "satisfy" },
};

describe("composition verifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ accepted: true, errorCodes: [],
      compiled: [{ expectedGas: 700_000 }, { expectedGas: 500_000 }],
      replay: { traceHash: hash("4"), stateDiffHash: hash("5"), eventsHash: hash("6"),
        balanceDeltas: [{ token: usdt0.aToken.address, account: policy.owner,
          beforeAtomic: "0", afterAtomic: "999000" }], deployments: [], observations: [] },
      execution: {}, authorization: {} });
  });

  it("derives a verifier-owned net-yield objective from replay and frozen evidence", async () => {
    const result = await verifyCompositionProposalV1({ runId: requestId, policy, snapshot,
      program, evidence: {}, nowSec: 2_000_000_100 }, {} as never);

    expect(result).toMatchObject({ accepted: true, objective: {
      version: 2, kind: "composition-net-yield-usd-e8", direction: "maximize",
      horizonDays: 30, evaluator: "composition-net-yield@1",
      evidenceHash: expect.stringMatching(/^0x[0-9a-f]{64}$/),
    } });
  });

  it("rejects route and receipt substitution before independent replay", async () => {
    const tampered = { ...program, actions: [{ ...program.actions[0], parameters: {
      ...program.actions[0]!.parameters, minimumOutputAtomic: "998000",
    } }, program.actions[1]] };
    await expect(verifyCompositionProposalV1({ runId: requestId, policy, snapshot,
      program: tampered, evidence: {}, nowSec: 2_000_000_100 }, {} as never))
      .resolves.toEqual({ accepted: false, errorCodes: ["POLICY_MISMATCH"] });
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
