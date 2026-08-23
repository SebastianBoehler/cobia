import type { Address } from "viem";
import { readGeneralAssetManifestHash, readOkxCredentials } from "../env";
import { createOkxClient } from "../okx/client";
import { createProductionGeneralAssetEligibilityV2 } from "../assets/production-general-asset-eligibility";
import { compileGeneralAssetDraftV1, type GeneralAssetCandidateV1 } from "./general-asset-draft";
import type { Hash } from "viem";

interface Input {
  owner: Address;
  goal: string;
  input: { chainId: 1 | 196; address: Address; maximumAtomic: string };
  output: { chainId: 1 | 196; address: Address; minimumAtomic: string };
}

interface Dependencies {
  lookup: Pick<ReturnType<typeof createOkxClient>, "searchToken">;
  verifier: ReturnType<typeof createProductionGeneralAssetEligibilityV2>;
  manifestHash: Hash;
}

export async function compileGeneralAssetRequestV1(input: Input, dependencies?: Dependencies) {
  const deps = dependencies ?? { lookup: createOkxClient({ credentials: readOkxCredentials() }),
    verifier: createProductionGeneralAssetEligibilityV2(),
    manifestHash: readGeneralAssetManifestHash() };
  const inputToken = await deps.lookup.searchToken(input.input.chainId, input.input.address);
  const outputToken = await deps.lookup.searchToken(input.output.chainId, input.output.address);
  if (!inputToken || inputToken.token !== input.input.address ||
      !outputToken || outputToken.token !== input.output.address) {
    return { status: "clarification" as const,
      question: "Select exact token contracts that OKX can resolve on each chain." };
  }
  const inputEvidence = await deps.verifier.eligibility({ chainId: input.input.chainId,
    token: input.input.address, inputAtomic: input.input.maximumAtomic });
  if (inputEvidence.status !== "eligible" || !inputEvidence.valuationHash ||
      !inputEvidence.valuationEvidence) {
    return { status: "clarification" as const,
      question: inputEvidence.status === "eligible"
        ? "Verified input valuation is unavailable." : inputEvidence.reason };
  }
  const sameAsset = input.input.chainId === input.output.chainId &&
    input.input.address === input.output.address;
  const outputEvidence = sameAsset ? inputEvidence : await deps.verifier.eligibility({
    chainId: input.output.chainId, token: input.output.address,
  });
  if (outputEvidence.status !== "eligible") {
    return { status: "clarification" as const, question: outputEvidence.reason };
  }
  const candidate = (token: typeof inputToken, evidence: typeof inputEvidence): GeneralAssetCandidateV1 => ({
    chainId: token!.chainId, token: token!.token, symbol: token!.symbol,
    name: token!.name, decimals: token!.decimals, status: "eligible",
    identityHash: evidence.identityHash, valuationHash: evidence.valuationHash,
  });
  return compileGeneralAssetDraftV1({ goal: input.goal, owner: input.owner,
    selection: { input: { chainId: input.input.chainId, token: input.input.address },
      output: { chainId: input.output.chainId, token: input.output.address } },
    maximumInputAtomic: input.input.maximumAtomic,
    maximumInputUsdE8: inputEvidence.valuationEvidence.conservativeValueUsdE8,
    minimumOutputAtomic: input.output.minimumAtomic,
    manifestHash: deps.manifestHash,
    candidates: [candidate(inputToken, inputEvidence),
      candidate(outputToken, outputEvidence as typeof inputEvidence)],
  });
}
