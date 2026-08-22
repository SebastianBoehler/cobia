import type { Address, Hash } from "viem";
import { buildCapabilityCompositionPolicyV1 } from "./composition-policy";
import type { ComposedIntentDraft } from "./composition-draft";
import {
  RWA_INTENT_ASSETS,
  type IntentReceiptValues,
} from "./capability-templates";
import { buildOpenIntentPolicyV3 } from "./open-policy";
import {
  protocolForbiddenTargets,
  type ProtocolExclusionId,
} from "./intent-controls";
import { instrumentCommitmentV1 } from "../instruments/production-registry";

interface Input {
  values: IntentReceiptValues | ComposedIntentDraft;
  requestId: string;
  owner: Address;
  inputAtomic: string;
  minimumAtomic: string | null;
  nonce: Hash;
  nowSec: number;
  displayGoal: string;
  excludedProtocols: ProtocolExclusionId[];
}

function isComposed(
  values: IntentReceiptValues | ComposedIntentDraft,
): values is ComposedIntentDraft {
  return "kind" in values && values.kind === "composed";
}

export function buildIntentComposerPolicy(input: Input) {
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
  if (values.templateId === "rwa-acquisition" && input.minimumAtomic && instrument &&
      instrument.eligibleJurisdictions.includes(values.jurisdiction)) {
    return buildOpenIntentPolicyV3({ ...openCommon, templateId: "rwa-acquisition",
      outputToken: instrument.token as Address, minimumOutputAtomic: input.minimumAtomic,
      instrumentCommitment: instrumentCommitmentV1(instrument),
      jurisdiction: values.jurisdiction, instrumentChainId: instrument.chainId });
  }
  throw new Error("Complete the minimum result before signing.");
}
