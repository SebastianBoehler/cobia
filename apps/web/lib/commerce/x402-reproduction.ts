import { commitment } from "@cobia/domain";
import type { Hash } from "viem";
import { X402AuthorizationPlanV1Schema } from "./x402-plan";

export type X402PlanReproductionV1 = {
  reproduced: true;
  compiledActionHash: Hash;
  traceHash: Hash;
  stateDiffHash: Hash;
  receiptCommitment: Hash;
};

/**
 * Reproduces the complete pre-signature x402 plan. There is no transaction to
 * execute yet; actual transfer calldata, logs, code and block identity are
 * independently checked after the owner-signed settlement lands on its declared chain.
 */
export function reproduceX402PlanV1(raw: unknown): X402PlanReproductionV1 {
  const plan = X402AuthorizationPlanV1Schema.parse(raw);
  const planHash = commitment(plan) as Hash;
  return {
    reproduced: true,
    compiledActionHash: planHash,
    traceHash: commitment({
      version: 1, kind: "x402-static-reproduction", planHash,
      endpoint: plan.endpoint, facilitator: plan.facilitator,
    }) as Hash,
    stateDiffHash: commitment({
      version: 1, kind: "x402-preauthorization-state", writes: [],
    }) as Hash,
    receiptCommitment: commitment({
      version: 1, kind: "x402-required-settlement",
      chainId: plan.chainId, asset: plan.asset, owner: plan.owner,
      payee: plan.payee, amount: plan.amount, nonce: plan.authorizationNonce,
      tokenCodeHash: plan.token.runtimeCodeHash, settlement: plan.settlement,
    }) as Hash,
  };
}
