import {
  projectRouteQuote,
  verifyBundle,
  type DecisionBundle,
  type MarketSnapshot,
  type StablecoinPolicy,
} from "@cobia/domain";
import { createDeterministicSolver, type Solver } from "@cobia/solvers";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { USDG_ADDRESS } from "../chain/xlayer";
import { runQuoteMarket } from "./run-market";

const nowSec = 1_900_000_000;
const account = privateKeyToAccount(keccak256(toHex("cobia-market-test-signer")));

function fixtures(): { policy: StablecoinPolicy; snapshot: MarketSnapshot } {
  const requestId = crypto.randomUUID();
  const policy: StablecoinPolicy = {
    version: 1,
    requestId,
    owner: "0x1111111111111111111111111111111111111111",
    executionChainId: 196,
    asset: USDG_ADDRESS,
    principalAtomic: "25000000000",
    maxProtocolExposureBps: 4_000,
    minTvlUsdE6: "250000000000",
    minNetApyBps: 200,
    maxSnapshotAgeSec: 300,
    deadline: nowSec + 1_800,
    noBridges: true,
  };
  return {
    policy,
    snapshot: {
      version: 1,
      requestId,
      chainId: 196,
      blockNumber: "1000",
      blockHash: `0x${"ab".repeat(32)}`,
      capturedAt: new Date(nowSec * 1_000).toISOString(),
      asset: { address: USDG_ADDRESS, symbol: "USDG", decimals: 6 },
      candidates: [
        { id: "cash:usdg", kind: "cash", apyBps: 0, tvlUsdE6: "0", retrievedAt: new Date(nowSec * 1_000).toISOString() },
        { id: "aave-v3:1", kind: "aave-v3", investmentId: "1", poolAddress: "0x2222222222222222222222222222222222222222", apyBps: 650, tvlUsdE6: "500000000000", utilizationBps: 7_000, retrievedAt: new Date(nowSec * 1_000).toISOString() },
      ],
    },
  };
}

describe("runQuoteMarket", () => {
  it("captures once, verifies private bundles, and publishes sanitized quotes", async () => {
    const { policy, snapshot } = fixtures();
    const events: string[] = [];
    const stored: DecisionBundle[] = [];
    const base = createDeterministicSolver({ solverId: "determinist", account });
    const solver: Solver = {
      ...base,
      async solve(input) {
        events.push(`solve:${Object.isFrozen(input.snapshot)}`);
        return base.solve(input);
      },
    };

    const result = await runQuoteMarket(policy, {
      captureSnapshot: async () => {
        events.push("capture");
        return Object.freeze(snapshot);
      },
      solvers: [solver],
      saveSnapshot: async () => { events.push("save-snapshot"); },
      saveQuote: async (bundle, verdict, quote) => {
        events.push(`save-quote:${verdict.executable}`);
        stored.push(bundle);
        expect(JSON.stringify(quote)).not.toContain("amountAtomic");
      },
      finish: async (state) => { events.push(`finish:${state}`); },
      verify: verifyBundle,
      project: projectRouteQuote,
      nowSec: () => nowSec,
      quotePriceAtomic: "100000",
    });

    expect(events).toEqual([
      "capture",
      "save-snapshot",
      "solve:true",
      "save-quote:true",
      "finish:quotes_ready",
    ]);
    expect(stored).toHaveLength(1);
    expect(result.quotes).toHaveLength(1);
  });

  it("marks a one-solver failure as partial without inventing a quote", async () => {
    const { policy, snapshot } = fixtures();
    const healthy = createDeterministicSolver({ solverId: "healthy", account });
    const failed: Solver = {
      id: "failed",
      address: account.address,
      solve: async () => { throw new Error("solver unavailable"); },
    };
    let finished = "";

    const result = await runQuoteMarket(policy, {
      captureSnapshot: async () => Object.freeze(snapshot),
      solvers: [healthy, failed],
      saveSnapshot: async () => undefined,
      saveQuote: async () => undefined,
      finish: async (state) => { finished = state; },
      verify: verifyBundle,
      project: projectRouteQuote,
      nowSec: () => nowSec,
      quotePriceAtomic: "100000",
    });

    expect(finished).toBe("partial");
    expect(result.quotes).toHaveLength(1);
    expect(result.failures).toEqual([{ solverId: "failed", message: "solver unavailable" }]);
  });
});
