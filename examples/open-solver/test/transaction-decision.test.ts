import { commitment } from "@cobia/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeXLayerTransaction } from "../src/transaction-decision";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;
const target = "0x4444444444444444444444444444444444444444" as const;
const payload = { route: "test" };

afterEach(() => vi.unstubAllEnvs());

describe("transaction decision finalization", () => {
  it("submits directly without solver-side replay unless preflight is enabled", async () => {
    vi.stubEnv("COBIA_SOLVER_PREFLIGHT_REPLAY", "false");
    vi.stubEnv("XLAYER_RPC_URL", "");
    const decision = await finalizeXLayerTransaction({
      intent: { id: "550e8400-e29b-41d4-a716-446655440000", policy: {
        kind: "open-onchain", owner, deadline: 300, maxEvidenceAgeSec: 300,
      }, snapshot: { kind: "open-onchain", anchors: [{ chainId: 196,
        blockNumber: "10", blockHash: hash("1") }] } } as never,
      stages: [{ id: "01-route", kind: "wallet-transaction", chainId: 196, dependsOn: [],
        provider: "evm.raw@1", quoteHash: hash("2"), responseHash: hash("3"),
        fetchedAt: 100, expiresAt: 220, sender: owner, recipient: owner,
        input: { token: inputToken, atomic: "10" },
        output: { chainId: 196, token: outputToken, minimumAtomic: "1" },
        transaction: { target, selector: "0x12345678", dataHash: hash("4"), valueAtomic: "0" },
        tools: ["test-route"] }],
      artifacts: [{ stageId: "01-route", provider: "evm.raw@1",
        payloadHash: commitment(payload), payload }],
      runner: "cobia-reference-test@1", nowSec: 100,
    });

    expect(decision).toMatchObject({ decision: "submit", proposalKind: "transaction-program",
      provenance: { dependencies: [] } });
    expect(decision).not.toHaveProperty("evidence");
  });
});
