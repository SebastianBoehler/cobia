import { commitment } from "@cobia/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRepositoryFixtureV2,
  repositoryTestNowSec,
} from "../db/repository-test-fixtures";
import type { ExecutionRehearsalTrace } from "./rehearsal-trace";
import {
  startMainnetExecutionV2,
  submitMainnetExecutionStepV2,
  type MainnetExecutionWalletV2,
  type MainnetExecutionSessionV2,
} from "./mainnet-execution-client";

const guided = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("./guided-step", async (original) => ({
  ...await original<typeof import("./guided-step")>(),
  submitGuidedStepV2: guided.submit,
}));

const routeId = `0x${"11".repeat(32)}` as const;
const buyer = "0xb27d2303b6ecbd4d175641c0b825d2210798f1d4" as const;

const trace: ExecutionRehearsalTrace = {
  version: 1, mode: "xlayer-mainnet-fork", engineVersion: "execution-v2@1",
  routeId, bundleHash: routeId, registryHash: `0x${"22".repeat(32)}`,
  executionChainId: 196, buyer, principalAtomic: "10000000",
  snapshot: { blockNumber: "67649362", blockHash: `0x${"33".repeat(32)}`,
    capturedAt: "2026-08-11T08:00:00.000Z" },
  result: { status: "success", transactions: [] },
};

describe("mainnet execution browser client", () => {
  afterEach(() => {
    vi.useRealTimers();
    guided.submit.mockReset();
  });
  it("signs a short-lived trace-bound proof and accepts only a scoped session", async () => {
    const wallet: MainnetExecutionWalletV2 = {
      account: buyer,
      switchToXLayer: vi.fn(async () => undefined),
      request: vi.fn(async () => `0x${"ab".repeat(65)}`),
    };
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.proof).toMatchObject({
        routeId,
        buyer,
        executionChainId: 196,
        rehearsalTraceHash: commitment(trace),
      });
      expect(body.proof.expiresAt - Math.floor(Date.now() / 1_000)).toBeLessThanOrEqual(240);
      return new Response(JSON.stringify({
        attempt: { id: "e35833b3-076c-4879-bdb6-cd90c17bdf63", routeId, buyer,
          executionChainId: 196, state: "active", nextOrdinal: 0, failureCode: null },
        steps: [], preparedStep: null, token: "header.payload",
        tokenExpiresAt: body.proof.expiresAt,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const session = await startMainnetExecutionV2({
      routeId,
      bundleHash: routeId,
      realm: "localhost:3000",
      trace,
      wallet,
      fetcher,
    });

    expect(wallet.switchToXLayer).toHaveBeenCalledOnce();
    expect(wallet.request).toHaveBeenCalledWith(expect.objectContaining({
      method: "personal_sign",
    }));
    expect(session.attempt.id).toBe("e35833b3-076c-4879-bdb6-cd90c17bdf63");
  });

  it("rejects a response scoped to another route", async () => {
    const wallet: MainnetExecutionWalletV2 = {
      account: buyer,
      switchToXLayer: vi.fn(async () => undefined),
      request: vi.fn(async () => `0x${"ab".repeat(65)}`),
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      attempt: { id: "e35833b3-076c-4879-bdb6-cd90c17bdf63",
        routeId: `0x${"99".repeat(32)}`, buyer, executionChainId: 196,
        state: "active", nextOrdinal: 0, failureCode: null },
      steps: [], preparedStep: null, token: "header.payload", tokenExpiresAt: 2_000_000_000,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(startMainnetExecutionV2({
      routeId, bundleHash: routeId, realm: "localhost:3000", trace, wallet, fetcher,
    })).rejects.toThrow("does not match purchased route");
  });

  it("durably arms the exact step before asking the wallet to submit it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(repositoryTestNowSec * 1_000);
    const fixture = await createRepositoryFixtureV2();
    const data = "0x1234" as const;
    const attemptId = "e35833b3-076c-4879-bdb6-cd90c17bdf63";
    const prepared = {
      ordinal: 0, state: "prepared", kind: "approval", from: fixture.policy.owner,
      to: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", valueAtomic: "0",
      calldata: data, calldataHash: commitment(data),
      semantic: { version: 1, label: "approve-aave-exact", phase: "initial",
        authorizedAmountAtomic: fixture.policy.principalAtomic,
        capturedState: { kind: "allowance", token: fixture.policy.asset,
          spender: "0xe3f3caefdd7180f884c01e57f65df979af84f116",
          expectedAtomic: fixture.policy.principalAtomic, beforeAtomic: "0" } },
      preBlockNumber: fixture.snapshot.blockNumber,
      preBlockHash: fixture.snapshot.blockHash, expectedNonce: "4", gasEstimateAtomic: "52000",
    };
    const base = {
      attempt: { id: attemptId, routeId: fixture.quote.quoteId,
        buyer: fixture.policy.owner, executionChainId: 196 as const,
        state: "active" as const, nextOrdinal: 0, failureCode: null },
      steps: [], token: "header.payload", tokenExpiresAt: repositoryTestNowSec + 240,
    };
    const session = { ...base, preparedStep: prepared } as MainnetExecutionSessionV2;
    const actions: unknown[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const action = JSON.parse(String(init?.body));
      actions.push(action);
      const armed = { ...prepared, state: "broadcasting" };
      return new Response(JSON.stringify({
        ...base,
        steps: action.action === "submitted" ? [{ ordinal: 0, state: "submitted",
          kind: "approval", label: "approve-aave-exact", to: prepared.to,
          gasEstimateAtomic: "52000", transactionHash: action.transactionHash,
          receipt: null, evidence: null, postcondition: null, failureCode: null }] : [],
        preparedStep: action.action === "arm" ? armed : null,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const wallet: MainnetExecutionWalletV2 = {
      account: fixture.policy.owner,
      switchToXLayer: vi.fn(async () => undefined),
      request: vi.fn(),
    };
    guided.submit.mockResolvedValue({ hash: `0x${"88".repeat(32)}` });

    await submitMainnetExecutionStepV2({
      routeId: fixture.quote.quoteId,
      policy: fixture.policy,
      snapshot: fixture.snapshot,
      bundle: fixture.bundle,
      session,
      wallet,
      readClient: {} as never,
      fetcher,
    });

    expect(actions).toEqual([
      { action: "arm", ordinal: 0 },
      { action: "submitted", ordinal: 0, transactionHash: `0x${"88".repeat(32)}` },
    ]);
    expect(guided.submit).toHaveBeenCalledOnce();
  });
});
