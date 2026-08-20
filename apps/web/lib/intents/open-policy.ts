import { OpenIntentPolicyV3Schema, type OpenIntentPolicyV3 } from "@cobia/domain";
import { isAddressEqual, type Address, type Hash } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";

const DEADLINE_LIFETIME_SEC = 30 * 60;
const MAX_COMPETITION_DURATION_SEC = 15 * 60;
const MAX_REVISIONS_PER_SOLVER = 5;
const RECEIPT_FLOOR_BPS = 9_950n;

interface CommonInput {
  requestId: string;
  owner: Address;
  inputToken: Address;
  inputAtomic: string;
  nonce: Hash;
  nowSec: number;
  displayGoal: string;
  competitionDurationSec: number;
}

type BuildInput = CommonInput & (
  | { templateId: "aave-supply"; exposureBps: number }
  | { templateId: "exact-input-swap"; outputToken: Address; minimumOutputAtomic: string }
  | { templateId: "round-trip"; minimumProfitAtomic: string }
  | { templateId: "rwa-acquisition"; outputToken: Address; minimumOutputAtomic: string;
      instrumentCommitment: Hash; jurisdiction: string }
);

function positive(value: string, label: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${label} must be a positive atomic amount`);
  return BigInt(value);
}

function receiptToken(inputToken: Address): Address {
  const entry = Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find(({ underlying }) =>
    isAddressEqual(underlying.address, inputToken));
  if (!entry) throw new Error("Earn input has no registered receipt identity");
  return entry.aToken.address.toLowerCase() as Address;
}

function outcome(input: BuildInput) {
  const amount = positive(input.inputAtomic, "Input");
  if (input.templateId === "aave-supply") {
    if (!Number.isInteger(input.exposureBps) || input.exposureBps < 1 || input.exposureBps > 10_000) {
      throw new Error("Protocol exposure must be between 1 and 10000 bps");
    }
    const minimum = amount * BigInt(input.exposureBps) / 10_000n * RECEIPT_FLOOR_BPS / 10_000n;
    if (minimum === 0n) throw new Error("Earn exposure is below one atomic unit");
    return { token: receiptToken(input.inputToken), atomic: minimum.toString() };
  }
  if (input.templateId === "exact-input-swap") {
    if (isAddressEqual(input.inputToken, input.outputToken)) throw new Error("Swap output must differ from input");
    return { token: input.outputToken.toLowerCase() as Address,
      atomic: positive(input.minimumOutputAtomic, "Minimum output").toString() };
  }
  if (input.templateId === "rwa-acquisition") {
    return { token: input.outputToken.toLowerCase() as Address,
      atomic: positive(input.minimumOutputAtomic, "Minimum output").toString() };
  }
  return { token: input.inputToken.toLowerCase() as Address,
    atomic: positive(input.minimumProfitAtomic, "Minimum profit").toString() };
}

export function buildOpenIntentPolicyV3(input: BuildInput): OpenIntentPolicyV3 {
  if (!input.displayGoal.trim()) throw new Error("Intent goal is required");
  if (!Number.isInteger(input.competitionDurationSec) || input.competitionDurationSec < 1 ||
    input.competitionDurationSec > MAX_COMPETITION_DURATION_SEC) {
    throw new Error("Competition duration must be between 1 and 900 seconds");
  }
  if (input.templateId === "rwa-acquisition") {
    return OpenIntentPolicyV3Schema.parse({
      version: 3, kind: "open-onchain", requestId: input.requestId,
      displayGoal: input.displayGoal.trim(), owner: input.owner.toLowerCase(),
      executionChainIds: [1, 196], nonce: input.nonce, createdAt: input.nowSec,
      deadline: input.nowSec + DEADLINE_LIFETIME_SEC,
      competition: { closesAt: input.nowSec + input.competitionDurationSec,
        maxRevisionsPerSolver: MAX_REVISIONS_PER_SOLVER },
      maxEvidenceAgeSec: 300,
      inputs: [{ chainId: 1, token: input.inputToken.toLowerCase(), maximumAtomic: input.inputAtomic }],
      outcomes: [{ kind: "registered-instrument", chainId: 1,
        token: input.outputToken.toLowerCase(), minimumIncreaseAtomic: input.minimumOutputAtomic,
        instrumentCommitment: input.instrumentCommitment, jurisdiction: input.jurisdiction,
        eligibilityAttested: true }],
      limits: { maxStages: 4, maxTransactions: 2, maxApprovals: 2, maxCalldataBytes: 32_768,
        maxGasPerTransaction: "5000000",
        maxNativeValueAtomicByChain: [{ chainId: 1, atomic: "0" }, { chainId: 196, atomic: "0" }] },
      forbiddenTargets: [], forbiddenAssets: [],
    });
  }
  const result = outcome(input);
  return OpenIntentPolicyV3Schema.parse({
    version: 3, kind: "open-onchain", requestId: input.requestId,
    displayGoal: input.displayGoal.trim(), owner: input.owner.toLowerCase(),
    executionChainIds: [196], nonce: input.nonce, createdAt: input.nowSec,
    deadline: input.nowSec + DEADLINE_LIFETIME_SEC,
    competition: { closesAt: input.nowSec + input.competitionDurationSec,
      maxRevisionsPerSolver: MAX_REVISIONS_PER_SOLVER },
    maxEvidenceAgeSec: 300,
    inputs: [{ chainId: 196, token: input.inputToken.toLowerCase(), maximumAtomic: input.inputAtomic }],
    outcomes: [{ kind: "minimum-increase", chainId: 196, token: result.token, atomic: result.atomic }],
    limits: { maxStages: 8, maxTransactions: 4, maxApprovals: 4, maxCalldataBytes: 16_384,
      maxGasPerTransaction: "5000000", maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
    forbiddenTargets: [], forbiddenAssets: [],
  });
}
