import { commitment } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionRehearsalTrace } from "./rehearsal-trace";
import {
  startMainnetExecutionV2,
  type MainnetExecutionWalletV2,
} from "./mainnet-execution-client";

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
});
