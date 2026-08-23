import { describe, expect, it } from "vitest";
import { compileGeneralAssetDraftV1, type GeneralAssetCandidateV1 } from "./general-asset-draft";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const inputToken = "0x1111111111111111111111111111111111111111" as const;
const duplicateInput = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;

function candidate(overrides: Partial<GeneralAssetCandidateV1>): GeneralAssetCandidateV1 {
  return {
    chainId: 196, token: inputToken, symbol: "RANDOM", name: "Random Token", decimals: 18,
    status: "eligible", identityHash: hash("1"), valuationHash: hash("2"),
    ...overrides,
  };
}

const base = {
  goal: "Swap RANDOM to OUT", owner: "0x4444444444444444444444444444444444444444" as const,
  selection: {
    input: { chainId: 196 as const, token: inputToken },
    output: { chainId: 1 as const, token: outputToken },
  },
  maximumInputAtomic: "1000000000000000000",
  maximumInputUsdE8: "25000000000",
  minimumOutputAtomic: "900000",
  manifestHash: hash("3"),
  evidenceExpiresAtSec: 2_000_000_030,
  candidates: [
    candidate({}),
    candidate({ chainId: 1, token: outputToken, symbol: "OUT", decimals: 6,
      identityHash: hash("4"), valuationHash: undefined }),
  ],
};

describe("general asset draft compiler", () => {
  it("binds only exact eligible chain/address selections and server commitments", () => {
    const result = compileGeneralAssetDraftV1({
      ...base,
      selection: { ...base.selection, output: { chainId: 196 as const, token: outputToken } },
      candidates: [base.candidates[0]!, { ...base.candidates[1]!, chainId: 196 as const }],
    });

    expect(result).toMatchObject({ status: "review", values: {
      kind: "general-asset-draft",
      sourceChainId: 196,
      destinationChainId: 196,
      input: { token: inputToken, maximumAtomic: base.maximumInputAtomic,
        maximumUsdE8: base.maximumInputUsdE8, identityHash: hash("1"), valuationHash: hash("2") },
      output: { token: outputToken, minimumAtomic: "900000", identityHash: hash("4") },
      allowedAdapters: [{ id: "okx.swap", version: 1 }],
    } });
  });

  it("keeps the first public release on a same-chain route with verified delivery", () => {
    expect(compileGeneralAssetDraftV1(base)).toEqual({
      status: "clarification",
      question: "Cross-chain general asset swaps are temporarily unavailable. Choose both tokens on the same chain.",
    });
  });

  it("requires an exact address when a symbol is ambiguous", () => {
    const candidates = [
      candidate({}),
      candidate({ token: duplicateInput }),
      ...base.candidates.slice(1),
    ];
    expect(compileGeneralAssetDraftV1({
      ...base, candidates,
      selection: { ...base.selection, input: { chainId: 196 as const, symbol: "RANDOM" } },
    })).toEqual({
      status: "clarification",
      question: "RANDOM matches multiple contracts on X Layer. Select the exact address.",
    });
  });

  it("surfaces unsupported behavior and rejects a route above the $1,000 cap", () => {
    const unsupported = candidate({ status: "unsupported", identityHash: undefined,
      valuationHash: undefined, reason: "Fee-on-transfer behavior is unsupported." });
    expect(compileGeneralAssetDraftV1({ ...base, candidates: [unsupported, base.candidates[1]!] }))
      .toEqual({ status: "clarification", question: "Fee-on-transfer behavior is unsupported." });
    expect(compileGeneralAssetDraftV1({ ...base, maximumInputUsdE8: "100000000001" }))
      .toEqual({ status: "clarification", question: "Maximum input cannot exceed $1,000 per route." });
  });
});
