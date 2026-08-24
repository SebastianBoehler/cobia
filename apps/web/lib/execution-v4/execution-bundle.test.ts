import type { GeneralAssetProgramVerdictV1 } from "@cobia/solvers";
import { describe, expect, it } from "vitest";
import { buildGeneralAssetExecutionBundleV4 } from "./execution-bundle";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const address = (byte: string) => `0x${byte.repeat(40)}` as `0x${string}`;

function verdict() {
  const owner = address("1");
  const first = { stageId: hash("1"), index: 0, chainId: 1 as const, predecessorStageId: null,
    input: { token: address("2"), maximumAtomic: "100", maximumUsdE8: "100000000",
      identityEvidenceHash: hash("2"), valuationEvidenceHash: hash("3") },
    outputs: [{ token: address("3"), minimumIncreaseAtomic: "90", identityEvidenceHash: hash("4") }],
    calls: [{ adapter: { id: "lifi.bridge", version: 1 }, target: address("4"),
      targetRuntimeCodeHash: hash("5"), calldata: "0x12345678", nativeValueAtomic: "0", gasLimit: 300_000,
      approvals: [] }], refundTokens: [address("2"), address("3")],
    finality: { confirmations: 12 }, delivery: { kind: "bridge" as const, destinationChainId: 196 as const,
      recipient: owner, minimumDeliveredAtomic: "90" } };
  const second = { ...first, stageId: hash("6"), index: 1, chainId: 196 as const,
    predecessorStageId: first.stageId, input: { ...first.input, token: address("3") },
    outputs: [{ token: address("5"), minimumIncreaseAtomic: "80", identityEvidenceHash: hash("7") }],
    delivery: { kind: "none" as const } };
  return { accepted: true as const, errorCodes: [] as [], policy: {} as never,
    program: { version: 1 as const, kind: "general-asset-program" as const, policyHash: hash("8"),
      manifestHash: hash("9"), canonicalProgramHash: hash("a"), owner, deadline: 2_000_000_000,
      identityEvidenceHashes: [hash("2")], valuationEvidenceHashes: [hash("3")],
      stages: [first, second], finalOutput: { chainId: 196 as const, token: address("5"), minimumAtomic: "80" } },
    manifest: {} as never, compiledStages: [], replays: [], replayHash: hash("b"),
    stageInputExposuresUsdE8: ["100000000", "90000000"],
    stageObservedInputExposuresUsdE8: ["100000000", "90000000"],
    stageInputIdentityEvidenceHashes: [hash("4"), hash("6")],
    stageOutputIdentityEvidenceHashes: [hash("6"), hash("8")],
    stageValuationEvidenceHashes: [hash("5"), hash("7")] } satisfies GeneralAssetProgramVerdictV1;
}

describe("general asset execution bundle", () => {
  it("projects ordered attested stages without freezing wallet nonces", () => {
    const accepted = verdict();
    const attestations = accepted.program.stages.map((stage, stageIndex) => ({ stageIndex,
      authorization: { chainId: BigInt(stage.chainId), owner: accepted.program.owner,
        canonicalProgramHash: accepted.program.canonicalProgramHash,
        deadline: BigInt(accepted.program.deadline - stageIndex - 1) },
      call: { to: address("9"), data: "0x12345678" as const, value: 0n }, evidenceHash: hash("c") }));
    const bundle = buildGeneralAssetExecutionBundleV4({ verdict: accepted, attestations });
    expect(bundle.stages[0]).toMatchObject({ transaction: { chainId: 1 },
      delivery: { token: address("3"), minimumAtomic: "90" } });
    expect(bundle.stages[0]!.transaction).not.toHaveProperty("nonce");
    expect(bundle.deadline).toBe(accepted.program.deadline - 2);
  });

  it("keeps consecutive same-chain stages without inventing bridge delivery", () => {
    const accepted = verdict();
    const [first, second] = accepted.program.stages;
    first!.chainId = 196;
    first!.delivery = { kind: "none" };
    const attestations = [first!, second!].map((stage, stageIndex) => ({ stageIndex,
      authorization: { chainId: BigInt(stage.chainId), owner: accepted.program.owner,
        canonicalProgramHash: accepted.program.canonicalProgramHash,
        deadline: BigInt(accepted.program.deadline) },
      call: { to: address("9"), data: "0x12345678" as const, value: 0n }, evidenceHash: hash("c") }));

    const bundle = buildGeneralAssetExecutionBundleV4({ verdict: accepted, attestations });

    expect(bundle.stages.map(({ delivery }) => delivery)).toEqual([{ kind: "none" }, { kind: "none" }]);
  });
});
