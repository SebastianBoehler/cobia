import type { Address } from "viem";
import { readGeneralAssetManifest, readOkxCredentials } from "../env";
import { createOkxClient } from "../okx/client";
import { createProductionGeneralAssetEligibilityV2 } from "../assets/production-general-asset-eligibility";
import { compileGeneralAssetDraftV1, type GeneralAssetCandidateV1 } from "./general-asset-draft";
import type { Hash } from "viem";
import { commitment } from "@cobia/domain";
import { GeneralAssetEvidenceArtifactV1Schema, type RegisteredAdapterManifestV1 } from "@cobia/solvers";
import { decimalToAtomic } from "./capability-templates";
import { deriveMarketMinimum, formatAtomicAmount } from "./market-minimum";

interface Input {
  owner: Address;
  goal: string;
  input: { chainId: 1 | 196; address: Address; maximumAtomic: string };
  output: { chainId: 1 | 196; address: Address; minimumAtomic?: string };
  settings?: { maxSlippageBps: number; marketMarginBps: number };
}

interface Dependencies {
  lookup: Pick<ReturnType<typeof createOkxClient>, "searchToken">;
  verifier: ReturnType<typeof createProductionGeneralAssetEligibilityV2>;
  manifest: RegisteredAdapterManifestV1;
}

export async function compileGeneralAssetRequestV1(input: Input, dependencies?: Dependencies) {
  const deps = dependencies ?? { lookup: createOkxClient({ credentials: readOkxCredentials() }),
    verifier: createProductionGeneralAssetEligibilityV2(),
    manifest: readGeneralAssetManifest() };
  const [inputToken, outputToken] = await Promise.all([
    deps.lookup.searchToken(input.input.chainId, input.input.address),
    deps.lookup.searchToken(input.output.chainId, input.output.address),
  ]);
  if (!inputToken || inputToken.token !== input.input.address ||
      !outputToken || outputToken.token !== input.output.address) {
    return { status: "clarification" as const,
      question: "Select exact token contracts that OKX can resolve on each chain." };
  }
  const sameAsset = input.input.chainId === input.output.chainId &&
    input.input.address === input.output.address;
  const inputEvidencePromise = deps.verifier.eligibility({ chainId: input.input.chainId,
    token: input.input.address, inputAtomic: input.input.maximumAtomic });
  const outputEvidencePromise = sameAsset ? inputEvidencePromise : deps.verifier.eligibility({
    chainId: input.output.chainId, token: input.output.address,
  });
  const [inputEvidence, outputEvidence] = await Promise.all([
    inputEvidencePromise, outputEvidencePromise,
  ]);
  if (inputEvidence.status !== "eligible" || !inputEvidence.valuationHash ||
      !inputEvidence.valuationEvidence) {
    return { status: "clarification" as const,
      question: inputEvidence.status === "eligible"
        ? "Verified input valuation is unavailable." : inputEvidence.reason };
  }
  if (outputEvidence.status !== "eligible") {
    return { status: "clarification" as const, question: outputEvidence.reason };
  }
  const derivedMinimum = input.output.minimumAtomic ? undefined : deriveMarketMinimum({
    amount: formatAtomicAmount(BigInt(inputEvidence.valuationEvidence.conservativeValueUsdE8), 8),
    inputDecimals: 8,
    inputPriceUsd: "1",
    outputDecimals: outputToken.decimals,
    outputPriceUsd: outputToken.priceUsd ?? "",
    protectionMarginBps: input.settings?.marketMarginBps,
  });
  const minimumOutputAtomic = input.output.minimumAtomic ?? (derivedMinimum
    ? decimalToAtomic(derivedMinimum, outputToken.decimals) : undefined);
  if (!minimumOutputAtomic) return { status: "clarification" as const,
    question: "A fresh output price is unavailable. State an \"at least\" output amount." };
  const candidate = (token: typeof inputToken, evidence: typeof inputEvidence): GeneralAssetCandidateV1 => ({
    chainId: token!.chainId, token: token!.token, symbol: token!.symbol,
    name: token!.name, decimals: token!.decimals, status: "eligible",
    identityHash: evidence.identityHash, valuationHash: evidence.valuationHash,
  });
  const evidenceExpiresAtSec = Math.min(inputEvidence.identityEvidence.expiresAtSec,
    outputEvidence.identityEvidence.expiresAtSec, inputEvidence.valuationEvidence.expiresAtSec);
  const result = compileGeneralAssetDraftV1({ goal: input.goal, owner: input.owner,
    selection: { input: { chainId: input.input.chainId, token: input.input.address },
      output: { chainId: input.output.chainId, token: input.output.address } },
    maximumInputAtomic: input.input.maximumAtomic,
    maximumInputUsdE8: inputEvidence.valuationEvidence.conservativeValueUsdE8,
    minimumOutputAtomic,
    ...(input.output.minimumAtomic ? {} : { minimumOutputSource: "market-default" as const }),
    maxSlippageBps: input.settings?.maxSlippageBps,
    manifestHash: commitment(deps.manifest) as Hash,
    evidenceExpiresAtSec,
    candidates: [candidate(inputToken, inputEvidence),
      candidate(outputToken, outputEvidence as typeof inputEvidence)],
  });
  if (result.status !== "review") return result;
  const identities = [inputEvidence.identityEvidence, outputEvidence.identityEvidence]
    .filter((value, index, values) => values.findIndex((candidate) =>
      commitment(candidate) === commitment(value)) === index);
  const generalAssetEvidence = GeneralAssetEvidenceArtifactV1Schema.parse({ version: 1,
    kind: "general-asset-evidence", identities, valuations: [inputEvidence.valuationEvidence],
    manifest: deps.manifest });
  return { ...result, generalAssetEvidence, evidenceExpiresAtSec };
}
