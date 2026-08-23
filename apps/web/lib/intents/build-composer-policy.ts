import { GeneralAssetPolicyV1Schema } from "@cobia/domain";
import type { Address, Hash } from "viem";
import { buildCapabilityCompositionPolicyV1 } from "./composition-policy";
import type { ComposedIntentDraft } from "./composition-draft";
import {
  decimalToAtomic,
  RWA_INTENT_ASSETS,
  type IntentReceiptValues,
} from "./capability-templates";
import { buildOpenIntentPolicyV3 } from "./open-policy";
import {
  protocolForbiddenTargets,
  type ProtocolExclusionId,
} from "./intent-controls";
import { instrumentCommitmentV1 } from "../instruments/production-registry";
import type { StagedConversionDraft } from "./staged-conversion-draft";
import type { GeneralAssetDraftV1 } from "./general-asset-draft";

interface Input {
  values: IntentReceiptValues | ComposedIntentDraft | StagedConversionDraft | GeneralAssetDraftV1;
  requestId: string;
  owner: Address;
  inputAtomic: string | null;
  minimumAtomic: string | null;
  nonce: Hash;
  nowSec: number;
  displayGoal: string;
  excludedProtocols: ProtocolExclusionId[];
}

function isComposed(
  values: IntentReceiptValues | ComposedIntentDraft | StagedConversionDraft,
): values is ComposedIntentDraft {
  return "kind" in values && values.kind === "composed";
}

function isStaged(values: Input["values"]): values is StagedConversionDraft {
  return "kind" in values && values.kind === "staged-conversion";
}

function isGeneralAsset(values: Input["values"]): values is GeneralAssetDraftV1 {
  return "kind" in values && values.kind === "general-asset-draft";
}

export function intentComposerExecutionChainIds(values: Input["values"]): Array<1 | 196> {
  if (isGeneralAsset(values)) {
    return [...new Set([values.sourceChainId, values.destinationChainId])].sort((a, b) => a - b);
  }
  if (!isComposed(values) && !isStaged(values) && values.templateId === "rwa-acquisition") {
    const instrument = RWA_INTENT_ASSETS.find(({ address }) => address === values.outputToken)?.instrument;
    if (instrument?.chainId === 1) return [1, 196];
  }
  return [196];
}

export function buildIntentComposerPolicy(input: Input) {
  if (isGeneralAsset(input.values)) {
    if (BigInt(input.values.input.maximumUsdE8) > 100_000_000_000n) {
      throw new Error("Maximum input cannot exceed $1,000 per route.");
    }
    const forbiddenTargets = protocolForbiddenTargets(input.excludedProtocols)
      .map((target) => ({ chainId: 196 as const, target }));
    return GeneralAssetPolicyV1Schema.parse({
      version: 1,
      kind: "general-asset",
      requestId: input.requestId,
      displayGoal: input.displayGoal,
      owner: input.owner.toLowerCase(),
      sourceChainId: input.values.sourceChainId,
      destinationChainId: input.values.destinationChainId,
      nonce: input.nonce.toLowerCase(),
      createdAt: input.nowSec,
      deadline: input.nowSec + 1_800,
      competition: { closesAt: input.nowSec + 300, maxRevisionsPerSolver: 5 },
      maxEvidenceAgeSec: 300,
      manifestHash: input.values.manifestHash,
      inputIdentityHash: input.values.input.identityHash,
      inputValuationHash: input.values.input.valuationHash,
      input: {
        chainId: input.values.sourceChainId,
        token: input.values.input.token,
        maximumAtomic: input.values.input.maximumAtomic,
        maximumUsdE8: input.values.input.maximumUsdE8,
      },
      outputs: [{
        chainId: input.values.destinationChainId,
        token: input.values.output.token,
        minimumAtomic: input.values.output.minimumAtomic,
      }],
      allowedAdapters: input.values.allowedAdapters,
      limits: input.values.limits,
      forbiddenTargets,
      forbiddenAssets: [],
    });
  }
  if (isStaged(input.values)) {
    const minimumOutputAtomic = decimalToAtomic(
      input.values.minimum, input.values.outputDecimals,
    );
    const inputs = input.values.inputs.map((item) => ({ token: item.token,
      maximumAtomic: decimalToAtomic(item.amount, item.decimals) }));
    if (!minimumOutputAtomic || inputs.some(({ maximumAtomic }) => !maximumAtomic)) {
      throw new Error("Complete every staged conversion bound before signing.");
    }
    return buildOpenIntentPolicyV3({
      requestId: input.requestId, owner: input.owner, nonce: input.nonce,
      nowSec: input.nowSec, displayGoal: input.displayGoal,
      forbiddenTargets: protocolForbiddenTargets(input.excludedProtocols),
      competitionDurationSec: 300, maxSolverFeeAtomic: "0",
      templateId: "staged-conversion", outputToken: input.values.outputToken,
      minimumOutputAtomic, minimumStages: input.values.minimumStages,
      inputs: inputs.map(({ token, maximumAtomic }) => ({ token,
        maximumAtomic: maximumAtomic! })),
    });
  }
  if (!input.inputAtomic) throw new Error("Complete the maximum input before signing.");
  const common = {
    requestId: input.requestId,
    owner: input.owner,
    inputToken: input.values.inputToken,
    inputAtomic: input.inputAtomic,
    nonce: input.nonce,
    nowSec: input.nowSec,
    displayGoal: input.displayGoal,
    forbiddenTargets: protocolForbiddenTargets(input.excludedProtocols),
  } as const;
  if (isComposed(input.values)) {
    return buildCapabilityCompositionPolicyV1({
      ...common,
      competitionDurationSec: input.values.competitionDurationSec,
      deadlineDurationSec: input.values.deadlineDurationSec,
      maxConversionLossBps: input.values.maxConversionLossBps,
      minimumReceiptValueBps: input.values.minimumReceiptValueBps,
      terminalAsset: input.values.terminalAsset,
      horizonDays: input.values.horizonDays,
    });
  }
  const values = input.values;
  const openCommon = {
    ...common,
    competitionDurationSec: 300,
    maxSolverFeeAtomic: "0",
  } as const;
  if (values.templateId === "aave-supply") {
    return buildOpenIntentPolicyV3({ ...openCommon, templateId: "aave-supply", exposureBps: 10_000 });
  }
  if (values.templateId === "exact-input-swap" && input.minimumAtomic) {
    return buildOpenIntentPolicyV3({ ...openCommon, templateId: "exact-input-swap",
      outputToken: values.outputToken, minimumOutputAtomic: input.minimumAtomic });
  }
  if (values.templateId === "round-trip" && input.minimumAtomic) {
    return buildOpenIntentPolicyV3({ ...openCommon, templateId: "round-trip",
      minimumProfitAtomic: input.minimumAtomic });
  }
  const instrument = RWA_INTENT_ASSETS.find(({ address }) => address === values.outputToken)?.instrument;
  if (values.templateId === "rwa-acquisition" && input.minimumAtomic && instrument) {
    if (instrument.chainId === 196 && values.jurisdiction) {
      return buildOpenIntentPolicyV3({ ...openCommon, templateId: "rwa-acquisition",
        outputToken: instrument.token as Address, minimumOutputAtomic: input.minimumAtomic,
        instrumentCommitment: instrumentCommitmentV1(instrument),
        jurisdiction: values.jurisdiction, instrumentChainId: instrument.chainId });
    }
    return buildOpenIntentPolicyV3({ ...openCommon, templateId: "rwa-acquisition",
      outputToken: instrument.token as Address, minimumOutputAtomic: input.minimumAtomic,
      outputChainId: instrument.chainId });
  }
  throw new Error("Complete the minimum result before signing.");
}
