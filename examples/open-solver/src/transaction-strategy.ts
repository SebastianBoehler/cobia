import { isNativeAssetAddress } from "@cobia/domain";
import type { SolverDecisionV1, SolverIntentV1 } from "@cobia/solver-sdk";
import type { ProviderArtifactV1 } from "@cobia/solvers";
import { isAddressEqual, type Address } from "viem";
import { PROTOCOL_REGISTRY } from "../../../apps/web/lib/adapters/registry";
import { XLAYER_WOKB, buildNativeOkbStage } from "./native-okb";
import {
  buildOkxRouteStage,
  fetchOkxRouteArtifact,
  okxMinimumOutputAtomic,
} from "./okx-route";
import { finalizeXLayerTransaction } from "./transaction-decision";
import { referenceTransactionExpiry } from "./transaction-validity";
import { aaveAssetForReceipt, buildAaveWithdrawStage } from "./aave-position-actions";
import {
  XLAYER_CURVE_LP_TOKEN,
  buildCurveAddLiquidityStage,
  buildCurveRemoveOneCoinStage,
} from "./curve-liquidity-strategy";

interface FinalizeInput {
  intent: SolverIntentV1;
  stages: unknown[];
  artifacts: ProviderArtifactV1[];
  runner: string;
  nowSec: number;
}

interface FetchInput {
  owner: Address;
  inputToken: Address;
  outputToken: Address;
  inputAtomic: string;
  slippagePercent: string;
  stageId: string;
}

interface TransactionStrategyDependencies {
  nowSec(): number;
  fetchOkxArtifact(input: FetchInput): Promise<unknown>;
  finalize(input: FinalizeInput): Promise<SolverDecisionV1>;
}

function defaultDependencies(): TransactionStrategyDependencies {
  return {
    nowSec: () => Math.floor(Date.now() / 1_000),
    async fetchOkxArtifact(input) {
      const apiKey = process.env.OKX_API_KEY;
      const secretKey = process.env.OKX_SECRET_KEY;
      const passphrase = process.env.OKX_PASSPHRASE;
      if (!apiKey || !secretKey || !passphrase) throw new Error("OKX credentials are unavailable");
      return fetchOkxRouteArtifact({ ...input, credentials: { apiKey, secretKey, passphrase } });
    },
    finalize: finalizeXLayerTransaction,
  };
}

function isWokbPair(inputToken: Address, outputToken: Address) {
  return (isNativeAssetAddress(inputToken) && outputToken === XLAYER_WOKB.address) ||
    (inputToken === XLAYER_WOKB.address && isNativeAssetAddress(outputToken));
}

export async function solveTransactionIntent(
  intent: SolverIntentV1,
  dependencies: TransactionStrategyDependencies = defaultDependencies(),
): Promise<SolverDecisionV1 | undefined> {
  if (intent.policy.kind !== "open-onchain" || intent.snapshot?.kind !== "open-onchain") return;
  const policy = intent.policy;
  const input = policy.inputs[0];
  const outcome = policy.outcomes[0];
  if (!input || policy.inputs.length !== 1 || policy.outcomes.length !== 1 ||
      input.chainId !== 196 || outcome?.kind !== "minimum-increase" || outcome.chainId !== 196) return;
  const nowSec = dependencies.nowSec();
  const finalize = (candidate: Omit<FinalizeInput, "intent" | "nowSec">) => {
    const count = candidate.stages.length;
    if (count < (policy.limits.minimumStages ?? 1) ||
        count > policy.limits.maxStages || count > policy.limits.maxTransactions) {
      return Promise.resolve(undefined);
    }
    return dependencies.finalize({ intent, nowSec, ...candidate });
  };
  try {
    if (isWokbPair(input.token, outcome.token)) {
      if (BigInt(outcome.atomic) > BigInt(input.maximumAtomic)) {
        return { version: 1, decision: "abstain", reasonCode: "NATIVE_OKB_OUTPUT_TOO_LOW" };
      }
      const built = buildNativeOkbStage({ stageId: "01-native-okb", owner: policy.owner,
        inputToken: input.token, outputToken: outcome.token, amountAtomic: input.maximumAtomic,
        fetchedAt: nowSec, expiresAt: referenceTransactionExpiry(nowSec, policy.deadline) });
      return finalize({ stages: [built.stage], artifacts: [built.artifact],
        runner: "cobia-reference-native-okb@1" });
    }
    if (isNativeAssetAddress(input.token)) return;
    if (isAddressEqual(outcome.token, XLAYER_CURVE_LP_TOKEN)) {
      const built = buildCurveAddLiquidityStage({ stageId: "01-curve-add",
        owner: policy.owner, inputToken: input.token, inputAtomic: input.maximumAtomic,
        minimumLpAtomic: outcome.atomic, fetchedAt: nowSec,
        expiresAt: referenceTransactionExpiry(nowSec, policy.deadline) });
      return finalize({ stages: [built.stage], artifacts: [built.artifact],
        runner: "cobia-reference-curve-liquidity@1" });
    }
    if (isAddressEqual(input.token, XLAYER_CURVE_LP_TOKEN)) {
      const built = buildCurveRemoveOneCoinStage({ stageId: "01-curve-remove",
        owner: policy.owner, outputToken: outcome.token, lpAtomic: input.maximumAtomic,
        minimumOutputAtomic: outcome.atomic, fetchedAt: nowSec,
        expiresAt: referenceTransactionExpiry(nowSec, policy.deadline) });
      return finalize({ stages: [built.stage], artifacts: [built.artifact],
        runner: "cobia-reference-curve-liquidity@1" });
    }
    const receipt = aaveAssetForReceipt(input.token);
    if (receipt) {
      const withdraw = buildAaveWithdrawStage({ stageId: "01-aave-withdraw",
        owner: policy.owner, aToken: input.token,
        underlying: receipt.underlying.address, amountAtomic: input.maximumAtomic,
        fetchedAt: nowSec, expiresAt: referenceTransactionExpiry(nowSec, policy.deadline) });
      if (isAddressEqual(receipt.underlying.address, outcome.token)) {
        return finalize({ stages: [withdraw.stage], artifacts: [withdraw.artifact],
          runner: "cobia-reference-aave-withdraw@1" });
      }
      const artifact = await dependencies.fetchOkxArtifact({ owner: policy.owner,
        inputToken: receipt.underlying.address.toLowerCase() as Address,
        outputToken: outcome.token, inputAtomic: input.maximumAtomic,
        slippagePercent: "0.5", stageId: "02-okx-swap" });
      const swap = buildOkxRouteStage({ artifact, owner: policy.owner,
        inputToken: receipt.underlying.address, outputToken: outcome.token,
        inputAtomic: input.maximumAtomic, minimumOutputAtomic: outcome.atomic,
        dependsOn: [withdraw.stage.id] });
      return finalize({ stages: [withdraw.stage, swap.stage],
        artifacts: [withdraw.artifact, swap.providerArtifact],
        runner: "cobia-reference-aave-okx@1" });
    }
    if ((policy.limits.minimumStages ?? 1) === 2) {
      if (policy.limits.maxStages < 2 || policy.limits.maxTransactions < 2) return;
      if (isNativeAssetAddress(outcome.token)) {
        if (policy.limits.maxApprovals < 1 ||
            policy.forbiddenAssets.includes(XLAYER_WOKB.address) ||
            policy.forbiddenTargets.includes(XLAYER_WOKB.address)) return;
        const swapArtifact = await dependencies.fetchOkxArtifact({ owner: policy.owner,
          inputToken: input.token, outputToken: XLAYER_WOKB.address,
          inputAtomic: input.maximumAtomic, slippagePercent: "0.5", stageId: "01-okx-swap" });
        const wrappedAtomic = okxMinimumOutputAtomic(swapArtifact);
        const swap = buildOkxRouteStage({ artifact: swapArtifact, owner: policy.owner,
          inputToken: input.token, outputToken: XLAYER_WOKB.address,
          inputAtomic: input.maximumAtomic, minimumOutputAtomic: outcome.atomic });
        const unwrap = buildNativeOkbStage({ stageId: "02-unwrap-okb", owner: policy.owner,
          inputToken: XLAYER_WOKB.address, outputToken: outcome.token,
          amountAtomic: wrappedAtomic, fetchedAt: nowSec,
          expiresAt: referenceTransactionExpiry(nowSec, policy.deadline),
          dependsOn: [swap.stage.id] });
        return finalize({ stages: [swap.stage, unwrap.stage],
          artifacts: [swap.providerArtifact, unwrap.artifact],
          runner: "cobia-reference-okx-unwrap@1" });
      }
      if (policy.limits.maxApprovals < 2) return;
      const intermediate = Object.values(PROTOCOL_REGISTRY.aaveV3.assets)
        .map(({ underlying }) => underlying.address.toLowerCase() as Address)
        .find((token) => !isAddressEqual(token, input.token) &&
          !isAddressEqual(token, outcome.token) && !policy.forbiddenAssets.includes(token));
      if (!intermediate) return;
      const firstArtifact = await dependencies.fetchOkxArtifact({ owner: policy.owner,
        inputToken: input.token, outputToken: intermediate, inputAtomic: input.maximumAtomic,
        slippagePercent: "0.5", stageId: "01-okx-swap" });
      const intermediateAtomic = okxMinimumOutputAtomic(firstArtifact);
      const first = buildOkxRouteStage({ artifact: firstArtifact, owner: policy.owner,
        inputToken: input.token, outputToken: intermediate, inputAtomic: input.maximumAtomic,
        minimumOutputAtomic: intermediateAtomic });
      const secondArtifact = await dependencies.fetchOkxArtifact({ owner: policy.owner,
        inputToken: intermediate, outputToken: outcome.token, inputAtomic: intermediateAtomic,
        slippagePercent: "0.5", stageId: "02-okx-swap" });
      const second = buildOkxRouteStage({ artifact: secondArtifact, owner: policy.owner,
        inputToken: intermediate, outputToken: outcome.token, inputAtomic: intermediateAtomic,
        minimumOutputAtomic: outcome.atomic, dependsOn: [first.stage.id] });
      return finalize({ stages: [first.stage, second.stage],
        artifacts: [first.providerArtifact, second.providerArtifact],
        runner: "cobia-reference-okx-two-step@1" });
    }
    if ((policy.limits.minimumStages ?? 1) > 2) return;
    const artifact = await dependencies.fetchOkxArtifact({ owner: policy.owner,
      inputToken: input.token, outputToken: outcome.token, inputAtomic: input.maximumAtomic,
      slippagePercent: "0.5", stageId: "01-okx-swap" });
    const built = buildOkxRouteStage({ artifact, owner: policy.owner,
      inputToken: input.token, outputToken: outcome.token, inputAtomic: input.maximumAtomic,
      minimumOutputAtomic: outcome.atomic });
    return finalize({ stages: [built.stage], artifacts: [built.providerArtifact],
      runner: "cobia-reference-okx@1" });
  } catch {
    return { version: 1, decision: "abstain", reasonCode: "NO_VERIFIED_OKX_ROUTE" };
  }
}
