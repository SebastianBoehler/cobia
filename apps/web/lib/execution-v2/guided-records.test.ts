import { describe, expect, it } from "vitest";
import {
  ScriptedReadClient,
  pool,
  successfulReceipt,
  transactionHash,
} from "./engine.test-fixture";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  confirmedStepRecordV2,
  parseConfirmedExecutionStepsV2,
  parseGuidedPreparedStepV2,
  preparedStepRecordV2,
} from "./guided-records";
import { prepareNextGuidedStepV2, resolveGuidedStepV2 } from "./guided-session";
import {
  INPUT_ATOMIC,
  NOW_SEC,
  directPlan,
  lpPlan,
  usdg,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";
import type { ConfirmedOwnerTransactionV2 } from "./engine-types";

describe("guided execution persistence codec", () => {
  it("round-trips the exact prepared transaction and captured state", async () => {
    const read = new ScriptedReadClient([]);
    read.latestBlocks.push(90n);
    read.allowance(usdt0, pool, 90n, 0n);
    const verified = await verifiedExecutionInput(directPlan);
    const prepared = await prepareNextGuidedStepV2({
      ...verified, nowSec: NOW_SEC, readClient: read,
    }, []);
    if (prepared.kind !== "prepared") throw new Error("Expected prepared step");

    const stored = preparedStepRecordV2("00000000-0000-4000-8000-000000000001", 0, prepared);
    expect(parseGuidedPreparedStepV2(stored)).toMatchObject({
      ...prepared,
      transaction: { ...prepared.transaction, to: prepared.transaction.to.toLowerCase() },
      capturedState: {
        ...prepared.capturedState,
        token: usdt0.toLowerCase(),
        spender: pool.toLowerCase(),
      },
    });
    expect(stored).toMatchObject({ kind: "approval", valueAtomic: "0" });
  });

  it("round-trips a confirmed result for deterministic next-step preparation", async () => {
    const read = new ScriptedReadClient([]);
    const hash = transactionHash(60);
    read.latestBlocks.push(100n, 102n);
    read.allowance(usdt0, pool, 100n, 0n);
    const verified = await verifiedExecutionInput(directPlan);
    const prepared = await prepareNextGuidedStepV2({
      ...verified, nowSec: NOW_SEC, readClient: read,
    }, []);
    if (prepared.kind !== "prepared") throw new Error("Expected prepared step");
    read.register(hash, {
      from: prepared.transaction.from,
      to: prepared.transaction.to,
      value: "0x0",
      data: prepared.transaction.data,
      nonce: prepared.expectedNonce,
    });
    read.receipts(hash, successfulReceipt(101n));
    read.allowance(usdt0, pool, 101n, INPUT_ATOMIC);
    const result = await resolveGuidedStepV2({
      ...verified,
      nowSec: NOW_SEC,
      readClient: read,
      prepared,
      transactionHash: hash,
      waitForReceiptPoll: async () => {},
    });
    if (result.status !== "confirmed") throw new Error("Expected confirmed step");

    const stored = confirmedStepRecordV2(result.transaction, false);
    expect(parseConfirmedExecutionStepsV2([{
      state: "confirmed",
      transactionHash: hash,
      receipt: stored.receipt,
      evidence: stored.evidence,
      postcondition: stored.postcondition,
    }])).toMatchObject([{
      ...result.transaction,
      protocolEvidence: {
        ...result.transaction.protocolEvidence,
        spender: pool.toLowerCase(),
      },
      stateCheck: {
        ...result.transaction.stateCheck,
        token: usdt0.toLowerCase(),
        spender: pool.toLowerCase(),
      },
    }]);
  });

  it("round-trips the LP mint and its signed minimum-liquidity bound", async () => {
    const read = new ScriptedReadClient([]);
    const manager = PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address;
    const verified = await verifiedExecutionInput(lpPlan);
    const swap = {
      label: "uniswap-v3-exact-input",
      hash: transactionHash(62),
      preBlockNumber: 98n,
      preBlockHash: `0x${"62".repeat(32)}`,
      blockNumber: 99n,
      blockHash: `0x${"63".repeat(32)}`,
      transactionIndex: 0,
      status: "success",
      gasEstimate: 21_000n,
      protocolEvidence: {
        kind: "swap", sender: verified.policy.owner, recipient: verified.policy.owner,
        inputAtomic: 25_000_000n, outputAtomic: 24_950_000n,
      },
      stateCheck: {
        kind: "swap", tokenIn: usdt0, tokenOut: usdg,
        inputSpentAtomic: 25_000_000n, outputDeltaAtomic: 24_950_000n,
        ownerOutputBalanceDeltaAtomic: 24_950_000n,
        minimumOutputAtomic: 24_700_500n,
      },
    } satisfies ConfirmedOwnerTransactionV2;
    read.latestBlocks.push(100n);
    read.allowance(usdg, manager, 100n, 24_950_000n);
    read.allowance(usdt0, manager, 100n, 25_000_000n);
    const prepared = await prepareNextGuidedStepV2({
      ...verified, nowSec: NOW_SEC, readClient: read,
    }, [swap]);
    if (prepared.kind !== "prepared") throw new Error("Expected LP mint step");

    const stored = preparedStepRecordV2(
      "00000000-0000-4000-8000-000000000002", 4, prepared,
    );
    expect(stored.semantic).toMatchObject({
      capturedState: {
        kind: "uniswap-lp-mint",
        minimumLiquidity: "24700500",
        deadlineSec: "2000000000",
      },
    });
    expect(parseGuidedPreparedStepV2(stored)).toMatchObject({
      transaction: {
        label: "uniswap-v3-full-range-mint",
        minimumLiquidity: 24_700_500n,
      },
      capturedState: { minimumLiquidity: 24_700_500n, deadlineSec: 2_000_000_000n },
    });
  });

  it("rejects malformed or non-confirmed persistence projections", () => {
    expect(() => parseGuidedPreparedStepV2({ semantic: {} })).toThrow();
    expect(() => parseConfirmedExecutionStepsV2([{
      state: "submitted", transactionHash: transactionHash(61),
      receipt: {}, evidence: {}, postcondition: {},
    }])).toThrow("confirmed");
  });
});
