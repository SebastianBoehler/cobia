import { commitment } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { registryHash, PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  createRepositoryFixtureV2,
  repositoryTestAccount,
  repositoryTestNowSec,
} from "../db/repository-test-fixtures";
import { createExecutionService } from "./execution-service";
import { ScriptedReadClient } from "./engine.test-fixture";
import {
  buildExecutionMainnetProof,
  executionMainnetCommitment,
} from "./mainnet-proof";

async function setup() {
  const fixture = await createRepositoryFixtureV2();
  const routeId = fixture.quote.quoteId;
  const trace = {
    version: 1, mode: "xlayer-mainnet-fork", engineVersion: "execution-v2@1",
    routeId, bundleHash: routeId, registryHash, executionChainId: 196,
    buyer: fixture.policy.owner, principalAtomic: fixture.policy.principalAtomic,
    snapshot: { blockNumber: fixture.snapshot.blockNumber,
      blockHash: fixture.snapshot.blockHash, capturedAt: fixture.snapshot.capturedAt },
    result: { status: "success", transactions: [] },
  };
  const rehearsal = {
    id: "4c6a39ca-c11a-4e04-95b0-c5fa488a7657",
    routeId,
    bundleHash: routeId,
    buyer: fixture.policy.owner.toLowerCase(),
    executionChainId: 196,
    state: "passed",
    registryHash,
    snapshotBlockHash: fixture.snapshot.blockHash,
    engineVersion: "execution-v2@1",
    traceHash: commitment(trace),
    trace,
  };
  const attempts: Array<Record<string, unknown> & { steps: Record<string, unknown>[] }> = [];
  const executions = {
    getByRoute: async () => attempts[0] ?? null,
    getAttempt: async () => attempts[0] ?? null,
    begin: async (input: Record<string, unknown>) => {
      const attempt = {
        id: "e35833b3-076c-4879-bdb6-cd90c17bdf63",
        ...input,
        state: "prepared",
        nextOrdinal: 0,
        steps: [] as Record<string, unknown>[],
      };
      attempts.push(attempt);
      return attempt;
    },
    prepareStep: async (input: Record<string, unknown>) => {
      const step = { id: crypto.randomUUID(), state: "prepared", ...input };
      attempts[0].steps.push(step);
      attempts[0].state = "active";
      return step;
    },
    bindSubmittedHash: async (_attemptId: string, ordinal: number, hash: string) => {
      const step = attempts[0].steps.find((item) => item.ordinal === ordinal);
      if (!step) throw new Error("step missing");
      step.state = "submitted";
      step.transactionHash = hash;
      return step;
    },
    confirmStep: async () => { throw new Error("not used"); },
    markReconcile: async (_attemptId: string, ordinal: number, code: string) => {
      const step = attempts[0].steps.find((item) => item.ordinal === ordinal);
      if (!step) throw new Error("step missing");
      step.state = "reconcile";
      step.failureCode = code;
      attempts[0].state = "reconcile";
      return { attempt: attempts[0], step };
    },
  };
  const read = new ScriptedReadClient([]);
  read.latestBlocks.push(90n);
  const first = fixture.bundle.routePlan.legs[0]?.actions[0];
  if (!first) throw new Error("Fixture needs an action");
  const token = first.kind === "aave-v3-supply"
    ? first.asset : first.tokenIn;
  const spender = first.kind === "aave-v3-supply"
    ? PROTOCOL_REGISTRY.aaveV3.pool.address
    : PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address;
  read.allowance(token, spender, 90n, 0n, fixture.policy.owner);
  read.balance(token, 90n, BigInt(fixture.policy.principalAtomic), fixture.policy.owner);
  const service = createExecutionService({
    purchases: { getPurchasedRoute: async () => ({
      id: routeId, requestId: fixture.policy.requestId, quoteId: routeId,
      buyer: fixture.policy.owner.toLowerCase(), executionChainId: 196,
      paymentChainId: 1952, paymentId: crypto.randomUUID(),
      receiptHash: `0x${"77".repeat(32)}`, bundle: fixture.bundle,
      purchasedAt: new Date("2026-08-09T10:01:00.000Z"),
    }) } as never,
    requests: { getPublicRequest: async () => ({
      policy: fixture.policy, snapshot: fixture.snapshot,
    }) } as never,
    rehearsals: { findPassed: async () => rehearsal } as never,
    executions: executions as never,
    readClient: read,
    realm: "localhost:3000",
    sessionSecret: "s".repeat(64),
    trustedSolverAddress: () => repositoryTestAccount.address,
    nowSec: () => repositoryTestNowSec,
    waitForReceiptPoll: async () => {},
  });
  const proof = buildExecutionMainnetProof({
    realm: "localhost:3000", routeId, bundleHash: routeId,
    buyer: fixture.policy.owner, executionChainId: 196,
    rehearsalTraceHash: rehearsal.traceHash,
    nonce: `0x${"55".repeat(32)}`, expiresAt: repositoryTestNowSec + 240,
  });
  const signature = await repositoryTestAccount.signMessage({
    message: { raw: executionMainnetCommitment(proof) },
  });
  return { service, routeId, proof, signature, attempts, rehearsal };
}

describe("guided mainnet execution service", () => {
  it("starts one rehearsal-bound attempt and persists one exact prepared step", async () => {
    const context = await setup();
    const result = await context.service.start(
      context.routeId, context.proof, context.signature,
    );
    expect(result).toMatchObject({
      attempt: { state: "active", nextOrdinal: 0 },
      preparedStep: { ordinal: 0, state: "prepared", valueAtomic: "0" },
    });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(context.attempts[0].steps).toHaveLength(1);
  });

  it("rejects a mismatched rehearsal before creating an attempt", async () => {
    const context = await setup();
    const changed = { ...context.proof, rehearsalTraceHash: `0x${"66".repeat(32)}` };
    const signature = await repositoryTestAccount.signMessage({
      message: { raw: executionMainnetCommitment(changed) },
    });
    await expect(context.service.start(context.routeId, changed, signature))
      .rejects.toThrow("rehearsal");
    expect(context.attempts).toHaveLength(0);
  });

  it("reissues scoped recovery access for the same attempt without another step", async () => {
    const context = await setup();
    const first = await context.service.start(context.routeId, context.proof, context.signature);
    const refreshed = { ...context.proof, nonce: `0x${"67".repeat(32)}` };
    const signature = await repositoryTestAccount.signMessage({
      message: { raw: executionMainnetCommitment(refreshed) },
    });
    const second = await context.service.start(context.routeId, refreshed, signature);
    expect(second.attempt.id).toBe(first.attempt.id);
    expect(context.attempts[0].steps).toHaveLength(1);
  });

  it("durably binds a wallet hash before reporting the step pending", async () => {
    const context = await setup();
    const started = await context.service.start(
      context.routeId, context.proof, context.signature,
    );
    const hash = `0x${"91".repeat(32)}` as const;
    const result = await context.service.advance(
      context.routeId,
      started.attempt.id,
      started.token,
      { action: "submitted", ordinal: 0, transactionHash: hash },
    );
    expect(result.steps).toEqual([
      expect.objectContaining({ ordinal: 0, state: "submitted", transactionHash: hash }),
    ]);
    expect(result.preparedStep).toBeNull();
  });
});
