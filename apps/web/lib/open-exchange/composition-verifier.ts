import {
  CapabilityCompositionPolicyV1Schema,
  CapabilityCompositionSnapshotV1Schema,
  commitment,
} from "@cobia/domain";
import { CapabilityProgramV2Schema } from "@cobia/solvers";
import { isAddressEqual, type Address } from "viem";
import { z } from "zod";
import { calculateCompositionNetYieldObjectiveV1 } from "./composition-objective";
import { deriveCompositionAuthorityV1 } from "./composition-authority";
import {
  verifyDerivedCapabilityProposalV1,
  type CapabilityVerifierDependencies,
} from "./capability-verifier-core";

const SupplyParametersSchema = z.object({
  asset: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  amountAtomic: z.string().regex(/^[1-9][0-9]*$/),
}).strict();

export async function verifyCompositionProposalV1(input: {
  runId: string;
  policy: unknown;
  snapshot: unknown;
  program: unknown;
  evidence: unknown;
  nowSec: number;
}, dependencies: CapabilityVerifierDependencies) {
  let policy;
  let snapshot;
  let program;
  let authority;
  try {
    policy = CapabilityCompositionPolicyV1Schema.parse(input.policy);
    snapshot = CapabilityCompositionSnapshotV1Schema.parse(input.snapshot);
    program = CapabilityProgramV2Schema.parse(input.program);
    authority = deriveCompositionAuthorityV1(policy, snapshot, {
      inputAtomic: program.input.atomic,
      actions: program.actions,
      balanceConstraints: program.balanceConstraints,
    });
  } catch {
    return { accepted: false as const, errorCodes: ["POLICY_MISMATCH"] };
  }
  const verification = await verifyDerivedCapabilityProposalV1({
    runId: input.runId, authority, owner: policy.owner,
    inputToken: policy.input.token, inputAmount: BigInt(program.input.atomic),
    program, evidence: input.evidence, nowSec: input.nowSec,
  }, dependencies);
  if (!verification.accepted || !verification.replay) return verification;
  try {
    const terminal = program.actions.at(-1)!;
    const supply = SupplyParametersSchema.parse(terminal.parameters);
    const opportunity = snapshot.route.opportunities.find((item): item is Extract<
      typeof snapshot.route.opportunities[number], { kind: "aave-v3-supply" }
    > => item.kind === "aave-v3-supply" &&
      isAddressEqual(item.asset, supply.asset as Address) &&
      item.validatedSupplyAtomic === supply.amountAtomic);
    const valuation = snapshot.route.valuations.find(({ asset }) =>
      isAddressEqual(asset, supply.asset as Address));
    const receipt = program.balanceConstraints[0];
    const delta = receipt && verification.replay.balanceDeltas.find(({ token, account }) =>
      isAddressEqual(token, receipt.token) && isAddressEqual(account, policy.owner));
    if (!opportunity || !valuation || !receipt || receipt.kind !== "minimumIncrease" || !delta) {
      throw new Error("Composition objective evidence is incomplete");
    }
    const receiptAtomic = BigInt(delta.afterAtomic) - BigInt(delta.beforeAtomic);
    if (receiptAtomic < 0n) throw new Error("Composition receipt delta is negative");
    const evidenceHash = commitment({
      policyHash: commitment(policy), snapshotHash: commitment(snapshot),
      programHash: commitment(program), traceHash: verification.replay.traceHash,
      stateDiffHash: verification.replay.stateDiffHash,
      eventsHash: verification.replay.eventsHash,
    });
    const objective = calculateCompositionNetYieldObjectiveV1({
      receiptAtomic: receiptAtomic.toString(), receiptDecimals: valuation.decimals,
      receiptPriceUsdE8: valuation.priceUsdE8,
      supplyRateBps: opportunity.supplyRateBps,
      horizonDays: policy.objective.horizonDays,
      expectedGas: verification.compiled.reduce((sum, action) => sum + action.expectedGas, 0),
      gasPriceAtomic: snapshot.gas.priceAtomic,
      nativePriceUsdE8: snapshot.gas.nativePriceUsdE8,
      solverFeeAtomic: policy.limits.maxSolverFeeAtomic,
      evidenceHash,
    });
    return { ...verification, objective };
  } catch {
    return { accepted: false as const, errorCodes: ["OBJECTIVE_MISMATCH"],
      replay: verification.replay };
  }
}
