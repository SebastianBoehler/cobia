import { describe, expect, it } from "vitest";
import {
  pool,
  ScriptedReadClient,
  ScriptedWallet,
  transactionHash,
} from "./engine.test-fixture";
import {
  recoverGuidedSubmissionV2,
  submitGuidedStepV2,
} from "./guided-step";
import { prepareNextGuidedStepV2 } from "./guided-session";
import {
  directPlan,
  NOW_SEC,
  OWNER,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";

async function prepared(read: ScriptedReadClient) {
  read.latestBlocks.push(90n);
  read.allowance(usdt0, pool, 90n, 0n);
  const verified = await verifiedExecutionInput(directPlan);
  const step = await prepareNextGuidedStepV2({
    ...verified, nowSec: NOW_SEC, readClient: read,
  }, []);
  if (step.kind !== "prepared") throw new Error("Expected a prepared step");
  return { step, verified };
}

describe("guided wallet step", () => {
  it("sends exactly one locally verified owner transaction", async () => {
    const read = new ScriptedReadClient([]);
    const wallet = new ScriptedWallet([]);
    wallet.connectReadClient(read);
    const { step, verified } = await prepared(read);
    const hash = transactionHash(50);
    wallet.hashes.push(hash);
    read.latestBlocks.push(91n);

    const submitted = await submitGuidedStepV2({
      ...verified,
      nowSec: () => NOW_SEC,
      readClient: read,
      wallet,
      prepared: step,
    });
    expect(submitted).toMatchObject({ hash, expectedNonce: step.expectedNonce });
    expect(wallet.sendCount).toBe(1);
  });

  it("rejects a substituted target or calldata before wallet send", async () => {
    const read = new ScriptedReadClient([]);
    const wallet = new ScriptedWallet([]);
    const { step, verified } = await prepared(read);
    const changed = {
      ...step,
      transaction: { ...step.transaction, to: OWNER, data: "0x1234" as const },
    };

    await expect(submitGuidedStepV2({
      ...verified,
      nowSec: () => NOW_SEC,
      readClient: read,
      wallet,
      prepared: changed,
    })).rejects.toThrow("authorized");
    expect(wallet.sendCount).toBe(0);
  });

  it("recovers only the exact owner nonce transaction and rejects ambiguity", async () => {
    const read = new ScriptedReadClient([]);
    const { step } = await prepared(read);
    const hash = transactionHash(51);
    read.latestBlocks.push(92n);
    read.blockTransactions.set(91n, [{
      hash,
      from: OWNER,
      to: step.transaction.to,
      value: 0n,
      input: step.transaction.data,
      nonce: Number(step.expectedNonce),
      blockNumber: 91n,
      blockHash: transactionHash(91),
      transactionIndex: 0,
    }]);
    await expect(recoverGuidedSubmissionV2(read, step)).resolves.toBe(hash);

    read.latestBlocks.push(92n);
    read.blockTransactions.set(92n, [{
      ...read.blockTransactions.get(91n)![0],
      hash: transactionHash(52),
      blockNumber: 92n,
    }]);
    await expect(recoverGuidedSubmissionV2(read, step)).rejects.toThrow("ambiguous");
  });

  it("fails closed when the prepared nonce was consumed by different calldata", async () => {
    const read = new ScriptedReadClient([]);
    const { step } = await prepared(read);
    read.latestBlocks.push(91n);
    read.blockTransactions.set(91n, [{
      hash: transactionHash(53), from: OWNER, to: step.transaction.to,
      value: 0n, input: "0x1234", nonce: Number(step.expectedNonce),
      blockNumber: 91n, blockHash: transactionHash(91), transactionIndex: 0,
    }]);
    await expect(recoverGuidedSubmissionV2(read, step)).rejects.toThrow("different transaction");
  });
});
