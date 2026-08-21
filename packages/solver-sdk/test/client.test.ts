import {
  commitment,
  OpenIntentPolicyV3Schema,
  solverDecisionClaimCommitmentV1,
  solverProfileClaimCommitmentV1,
} from "@cobia/domain";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { createSolverExchangeClient } from "../src/client";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const policy = OpenIntentPolicyV3Schema.parse({
  version: 3, kind: "open-onchain", requestId: "550e8400-e29b-41d4-a716-446655440000",
  displayGoal: "Receive at least one verified output token", owner: account.address.toLowerCase(),
  executionChainIds: [196], nonce: hash("2"), createdAt: 2_000_000_000,
  deadline: 2_000_001_800, competition: { closesAt: 2_000_000_300, maxRevisionsPerSolver: 5 },
  maxEvidenceAgeSec: 300,
  inputs: [{ chainId: 196, token: "0x2222222222222222222222222222222222222222", maximumAtomic: "10" }],
  outcomes: [{ kind: "minimum-increase", chainId: 196,
    token: "0x3333333333333333333333333333333333333333", atomic: "1" }],
  limits: { maxStages: 4, maxTransactions: 2, maxApprovals: 2, maxCalldataBytes: 16_384,
    maxGasPerTransaction: "5000000", maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] },
  forbiddenTargets: [], forbiddenAssets: [],
});
const snapshot = {
  version: 1 as const, kind: "open-onchain" as const, requestId: policy.requestId,
  capturedAt: "2033-05-18T03:33:30.000Z",
  anchors: [{ chainId: 196 as const, blockNumber: "68461706", blockHash: hash("6") }],
};

async function response(overrides: Record<string, unknown> = {}) {
  const policyHash = commitment(policy);
  const ownerSignature = await account.signMessage({ message: { raw: policyHash } });
  return new Response(JSON.stringify({
    observedAt: 2_000_000_100,
    intents: [{ id: policy.requestId, policy, policyHash, ownerSignature, snapshot,
      snapshotHash: commitment(snapshot),
      competitionClosesAt: policy.competition.closesAt,
      links: { intent: `/api/intents/${policy.requestId}`,
        decisions: `/api/intents/${policy.requestId}/decisions` }, ...overrides }],
  }), { headers: { "content-type": "application/json" } });
}

describe("solver exchange client", () => {
  it("lists only owner-signed canonical open intents", async () => {
    const fetch = vi.fn(async () => response());
    const client = createSolverExchangeClient({ baseUrl: "https://getcobia.com", fetch });

    const result = await client.listIntents();

    expect(result.intents[0]?.policy).toEqual(policy);
    expect(fetch).toHaveBeenCalledWith("https://getcobia.com/api/intents", {
      headers: { accept: "application/json" }, signal: expect.any(AbortSignal),
    });
  });

  it("accepts the explicit local Compose exchange without weakening public HTTPS", () => {
    expect(() => createSolverExchangeClient({
      baseUrl: "http://host.docker.internal:3000",
      fetch: vi.fn(),
    })).not.toThrow();
    expect(() => createSolverExchangeClient({
      baseUrl: "http://example.com",
      fetch: vi.fn(),
    })).toThrow(/HTTPS/);
  });

  it("rejects commitment drift, invalid owner signatures, and credential-bearing origins", async () => {
    const drifted = createSolverExchangeClient({
      baseUrl: "https://getcobia.com",
      fetch: vi.fn(async () => response({ policyHash: hash("f") })),
    });
    await expect(drifted.listIntents()).rejects.toThrow(/commitment/i);

    const signature = await privateKeyToAccount(`0x${"44".repeat(32)}`).signMessage({
      message: { raw: commitment(policy) },
    });
    const unsigned = createSolverExchangeClient({
      baseUrl: "https://getcobia.com",
      fetch: vi.fn(async () => response({ ownerSignature: signature })),
    });
    await expect(unsigned.listIntents()).rejects.toThrow(/signature/i);
    expect(() => createSolverExchangeClient({
      baseUrl: "https://secret@example.com", fetch: vi.fn(),
    })).toThrow(/credential/i);
  });

  it("registers an operator-signed solver profile without receiving a signing key", async () => {
    const claim = {
      version: 1 as const,
      solverId: "alpha-solver",
      displayName: "Alpha Solver",
      operator: account.address.toLowerCase() as `0x${string}`,
      declaredCapabilities: ["evm.raw@1"],
      nonce: hash("5"),
      issuedAt: 2_000_000_000,
      expiresAt: 2_000_000_300,
    };
    const signature = await account.signMessage({
      message: { raw: solverProfileClaimCommitmentV1(claim) },
    });
    const fetch = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(JSON.stringify({
      solverId: claim.solverId, operator: claim.operator,
      links: { profile: `/solvers/${claim.solverId}` },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    const client = createSolverExchangeClient({ baseUrl: "https://getcobia.com", fetch });

    await expect(client.registerSolver({ claim, signature })).resolves.toMatchObject({
      solverId: claim.solverId,
    });
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ claim, signature });
    expect(JSON.stringify(body)).not.toMatch(/privateKey|seed|mnemonic/i);
  });

  it("submits an operator-signed decision bound to the exact snapshot and payload", async () => {
    const decision = { version: 1 as const, decision: "abstain" as const, reasonCode: "NO_ROUTE" };
    const claim = {
      version: 1 as const,
      solverId: "alpha-solver",
      intentId: policy.requestId,
      revision: 1,
      decisionHash: commitment(decision),
      snapshotHash: hash("6"),
      nonce: hash("7"),
      issuedAt: 2_000_000_000,
      expiresAt: 2_000_000_300,
    };
    const signature = await account.signMessage({
      message: { raw: solverDecisionClaimCommitmentV1(claim) },
    });
    const fetch = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(JSON.stringify({
      intentId: claim.intentId,
      solverId: claim.solverId,
      revision: claim.revision,
      state: "abstained",
    }), { status: 202, headers: { "content-type": "application/json" } }));
    const client = createSolverExchangeClient({ baseUrl: "https://getcobia.com", fetch });

    await expect(client.submitDecision({ claim, signature, decision })).resolves.toMatchObject({
      state: "abstained",
    });
    expect(fetch).toHaveBeenCalledWith(
      `https://getcobia.com/api/intents/${policy.requestId}/decisions`,
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ claim, signature, decision });
    expect(JSON.stringify(body)).not.toMatch(/privateKey|seed|mnemonic/i);
  });

  it("allows decision verification to outlive the short read timeout", async () => {
    const decision = { version: 1 as const, decision: "abstain" as const, reasonCode: "NO_ROUTE" };
    const claim = {
      version: 1 as const,
      solverId: "alpha-solver",
      intentId: policy.requestId,
      revision: 1,
      decisionHash: commitment(decision),
      snapshotHash: hash("6"),
      nonce: hash("7"),
      issuedAt: 2_000_000_000,
      expiresAt: 2_000_000_300,
    };
    const signature = await account.signMessage({
      message: { raw: solverDecisionClaimCommitmentV1(claim) },
    });
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const client = createSolverExchangeClient({
      baseUrl: "https://getcobia.com",
      fetch: vi.fn(async () => Response.json({
        intentId: claim.intentId,
        solverId: claim.solverId,
        revision: claim.revision,
        state: "abstained",
      }, { status: 202 })),
    });

    await client.submitDecision({ claim, signature, decision });

    expect(timeout).toHaveBeenCalledWith(185_000);
    timeout.mockRestore();
  });

  it("rejects a decision that does not match its signed commitment", async () => {
    const decision = { version: 1 as const, decision: "abstain" as const, reasonCode: "NO_ROUTE" };
    const claim = {
      version: 1 as const,
      solverId: "alpha-solver",
      intentId: policy.requestId,
      revision: 1,
      decisionHash: hash("8"),
      snapshotHash: hash("6"),
      nonce: hash("7"),
      issuedAt: 2_000_000_000,
      expiresAt: 2_000_000_300,
    };
    const signature = await account.signMessage({
      message: { raw: solverDecisionClaimCommitmentV1(claim) },
    });
    const client = createSolverExchangeClient({
      baseUrl: "https://getcobia.com",
      fetch: vi.fn(),
    });

    await expect(client.submitDecision({ claim, signature, decision }))
      .rejects.toThrow(/decision commitment/i);
  });

  it("preserves the exchange error code for operator diagnostics", async () => {
    const decision = { version: 1 as const, decision: "abstain" as const, reasonCode: "NO_ROUTE" };
    const claim = {
      version: 1 as const, solverId: "alpha-solver", intentId: policy.requestId, revision: 1,
      decisionHash: commitment(decision), snapshotHash: hash("6"), nonce: hash("7"),
      issuedAt: 2_000_000_000, expiresAt: 2_000_000_300,
    };
    const signature = await account.signMessage({
      message: { raw: solverDecisionClaimCommitmentV1(claim) },
    });
    const client = createSolverExchangeClient({ baseUrl: "https://getcobia.com",
      fetch: vi.fn(async () => Response.json({ code: "DECISION_UNAVAILABLE",
        message: "Solver decision was not accepted." }, { status: 409 })) });

    await expect(client.submitDecision({ claim, signature, decision }))
      .rejects.toThrow("HTTP 409 (DECISION_UNAVAILABLE)");
  });
});
