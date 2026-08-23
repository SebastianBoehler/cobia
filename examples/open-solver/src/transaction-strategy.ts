import { isNativeAssetAddress } from "@cobia/domain";
import type { SolverDecisionV1, SolverIntentV1 } from "@cobia/solver-sdk";
import type { ProviderArtifactV1 } from "@cobia/solvers";
import type { Address } from "viem";
import { XLAYER_WOKB, buildNativeOkbStage } from "./native-okb";
import { buildOkxRouteStage, fetchOkxRouteArtifact } from "./okx-route";
import { finalizeXLayerTransaction } from "./transaction-decision";
import { aaveAssetForReceipt, buildAaveWithdrawStage } from "./aave-position-actions";

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
  const input = intent.policy.inputs[0];
  const outcome = intent.policy.outcomes[0];
  if (!input || intent.policy.inputs.length !== 1 || intent.policy.outcomes.length !== 1 ||
      input.chainId !== 196 || outcome?.kind !== "minimum-increase" || outcome.chainId !== 196) return;
  const nowSec = dependencies.nowSec();
  try {
    if (isWokbPair(input.token, outcome.token)) {
      if (BigInt(outcome.atomic) > BigInt(input.maximumAtomic)) {
        return { version: 1, decision: "abstain", reasonCode: "NATIVE_OKB_OUTPUT_TOO_LOW" };
      }
      const built = buildNativeOkbStage({ stageId: "01-native-okb", owner: intent.policy.owner,
        inputToken: input.token, outputToken: outcome.token, amountAtomic: input.maximumAtomic,
        fetchedAt: nowSec, expiresAt: Math.min(intent.policy.deadline, nowSec + 30) });
      return dependencies.finalize({ intent, stages: [built.stage], artifacts: [built.artifact],
        runner: "cobia-reference-native-okb@1", nowSec });
    }
    if (isNativeAssetAddress(input.token)) return;
    const receipt = aaveAssetForReceipt(input.token);
    if (receipt) {
      const withdraw = buildAaveWithdrawStage({ stageId: "01-aave-withdraw",
        owner: intent.policy.owner, aToken: input.token,
        underlying: receipt.underlying.address, amountAtomic: input.maximumAtomic,
        fetchedAt: nowSec, expiresAt: Math.min(intent.policy.deadline, nowSec + 30) });
      const artifact = await dependencies.fetchOkxArtifact({ owner: intent.policy.owner,
        inputToken: receipt.underlying.address.toLowerCase() as Address,
        outputToken: outcome.token, inputAtomic: input.maximumAtomic,
        slippagePercent: "0.5", stageId: "02-okx-swap" });
      const swap = buildOkxRouteStage({ artifact, owner: intent.policy.owner,
        inputToken: receipt.underlying.address, outputToken: outcome.token,
        inputAtomic: input.maximumAtomic, minimumOutputAtomic: outcome.atomic,
        dependsOn: [withdraw.stage.id] });
      return dependencies.finalize({ intent, stages: [withdraw.stage, swap.stage],
        artifacts: [withdraw.artifact, swap.providerArtifact],
        runner: "cobia-reference-aave-okx@1", nowSec });
    }
    const artifact = await dependencies.fetchOkxArtifact({ owner: intent.policy.owner,
      inputToken: input.token, outputToken: outcome.token, inputAtomic: input.maximumAtomic,
      slippagePercent: "0.5", stageId: "01-okx-swap" });
    const built = buildOkxRouteStage({ artifact, owner: intent.policy.owner,
      inputToken: input.token, outputToken: outcome.token, inputAtomic: input.maximumAtomic,
      minimumOutputAtomic: outcome.atomic });
    return dependencies.finalize({ intent, stages: [built.stage],
      artifacts: [built.providerArtifact], runner: "cobia-reference-okx@1", nowSec });
  } catch {
    return { version: 1, decision: "abstain", reasonCode: "NO_VERIFIED_OKX_ROUTE" };
  }
}
