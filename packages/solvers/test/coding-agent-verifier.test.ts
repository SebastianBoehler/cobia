import { commitment } from "@cobia/domain";
import { encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import {
  codingAgentProposalCommitment,
  verifyCodingAgentProposalV1,
} from "../src/index";
import {
  routeInputAsset,
  routePolicy,
  routeSnapshot,
} from "./routing-v2-fixtures";

const pool = "0x4444444444444444444444444444444444444444" as `0x${string}`;
const tokenCodeHash = `0x${"11".repeat(32)}` as const;
const poolCodeHash = `0x${"22".repeat(32)}` as const;
const poolImplementation = "0x5555555555555555555555555555555555555555" as `0x${string}`;
const poolImplementationCodeHash = `0x${"33".repeat(32)}` as const;

const approve = (amount: bigint) => encodeFunctionData({
  abi: [{
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  }],
  functionName: "approve",
  args: [pool, amount],
});

const supply = (amount: bigint, onBehalfOf = routePolicy.owner) => encodeFunctionData({
  abi: [{
    type: "function",
    name: "supply",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  }],
  functionName: "supply",
  args: [routeInputAsset, amount, onBehalfOf, 0],
});

function proposal() {
  return {
    version: 1 as const,
    requestId: routePolicy.requestId,
    policyHash: commitment(routePolicy),
    chainId: 196 as const,
    owner: routePolicy.owner,
    deadline: routePolicy.deadline,
    calls: [
      { to: routeInputAsset, valueAtomic: "0", data: approve(50_000_000n) },
      { to: pool, valueAtomic: "0", data: supply(50_000_000n) },
    ],
    minimumFinalBalances: [{
      asset: routeInputAsset,
      owner: routePolicy.owner,
      atomic: "50000000",
    }],
  };
}

const manifest = {
  version: 1 as const,
  chainId: 196 as const,
  deployments: [
    {
      address: routeInputAsset,
      runtimeCodeHash: tokenCodeHash,
      capability: { kind: "erc20-approve" as const, approvalSpenders: [pool] },
    },
    {
      address: pool,
      runtimeCodeHash: poolCodeHash,
      implementation: { address: poolImplementation, runtimeCodeHash: poolImplementationCodeHash },
      capability: { kind: "aave-v3-supply" as const },
    },
  ],
};

function evidence(rawProposal = proposal()) {
  return {
    version: 1 as const,
    proposalHash: codingAgentProposalCommitment(rawProposal),
    chainId: 196 as const,
    blockNumber: routeSnapshot.blockNumber,
    blockHash: routeSnapshot.blockHash,
    traceHash: `0x${"44".repeat(32)}`,
    stateDiffHash: `0x${"55".repeat(32)}`,
    finalBalances: [{ asset: routeInputAsset, owner: routePolicy.owner, atomic: "50000000" }],
    deployments: [
      { address: routeInputAsset, runtimeCodeHash: tokenCodeHash },
      {
        address: pool,
        runtimeCodeHash: poolCodeHash,
        implementation: { address: poolImplementation, runtimeCodeHash: poolImplementationCodeHash },
      },
    ],
  };
}

const replay = async () => ({
  reproduced: true as const,
  traceHash: `0x${"44".repeat(32)}` as `0x${string}`,
  stateDiffHash: `0x${"55".repeat(32)}` as `0x${string}`,
  finalBalances: [{
    asset: routeInputAsset as `0x${string}`,
    owner: routePolicy.owner,
    atomic: "50000000",
  }],
  deployments: [
    { address: routeInputAsset as `0x${string}`, runtimeCodeHash: tokenCodeHash },
    {
      address: pool,
      runtimeCodeHash: poolCodeHash,
      implementation: { address: poolImplementation, runtimeCodeHash: poolImplementationCodeHash },
    },
  ],
});

describe("coding-agent proposal verifier", () => {
  it("accepts a pinned USDG approval and Aave supply only after an independent replay", async () => {
    const result = await verifyCodingAgentProposalV1({
      policy: routePolicy,
      wallet: routePolicy.owner,
      snapshot: routeSnapshot,
      manifest,
      proposal: proposal(),
      evidence: evidence(),
      nowSec: routeNowSec(),
      replay,
    });

    expect(result).toEqual({ accepted: true, errorCodes: [] });
  });

  it("rejects an approval that expands beyond the policy principal", async () => {
    const unsafe = proposal();
    unsafe.calls[0] = { ...unsafe.calls[0]!, data: approve(100_000_001n) };
    const result = await verifyCodingAgentProposalV1({
      policy: routePolicy, wallet: routePolicy.owner, snapshot: routeSnapshot, manifest,
      proposal: unsafe, evidence: evidence(unsafe), nowSec: routeNowSec(), replay,
    });
    expect(result).toEqual({ accepted: false, errorCodes: ["APPROVAL_AMOUNT_EXCEEDED"] });
  });

  it("rejects a supply whose recipient is not the wallet owner", async () => {
    const unsafe = proposal();
    unsafe.calls[1] = {
      ...unsafe.calls[1]!,
      data: supply(50_000_000n, "0x6666666666666666666666666666666666666666"),
    };
    const result = await verifyCodingAgentProposalV1({
      policy: routePolicy, wallet: routePolicy.owner, snapshot: routeSnapshot, manifest,
      proposal: unsafe, evidence: evidence(unsafe), nowSec: routeNowSec(), replay,
    });
    expect(result).toEqual({ accepted: false, errorCodes: ["RECIPIENT_MISMATCH"] });
  });

  it("rejects mutable proxy evidence before replay", async () => {
    const unsafeEvidence = evidence();
    unsafeEvidence.deployments[1] = {
      address: pool,
      runtimeCodeHash: poolCodeHash,
      implementation: { address: poolImplementation, runtimeCodeHash: `0x${"66".repeat(32)}` },
    };
    const result = await verifyCodingAgentProposalV1({
      policy: routePolicy, wallet: routePolicy.owner, snapshot: routeSnapshot, manifest,
      proposal: proposal(), evidence: unsafeEvidence, nowSec: routeNowSec(), replay,
    });
    expect(result).toEqual({ accepted: false, errorCodes: ["PROXY_IMPLEMENTATION_MISMATCH"] });
  });

  it("rejects simulation evidence that a fresh fork cannot reproduce", async () => {
    const result = await verifyCodingAgentProposalV1({
      policy: routePolicy, wallet: routePolicy.owner, snapshot: routeSnapshot, manifest,
      proposal: proposal(), evidence: evidence(), nowSec: routeNowSec(),
      replay: async () => ({
        ...await replay(),
        deployments: [{
          address: pool,
          runtimeCodeHash: `0x${"77".repeat(32)}` as `0x${string}`,
          implementation: { address: poolImplementation, runtimeCodeHash: poolImplementationCodeHash },
        }],
      }),
    });
    expect(result).toEqual({ accepted: false, errorCodes: ["REPLAY_MISMATCH"] });
  });
});

function routeNowSec() {
  return Math.floor(Date.parse(routeSnapshot.capturedAt) / 1_000) + 60;
}
