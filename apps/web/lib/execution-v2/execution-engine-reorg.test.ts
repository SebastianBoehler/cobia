import { describe, expect, it } from "vitest";
import { executeRoutePlanV2 } from "./execute-route";
import {
  aUsdt0,
  pool,
  ScriptedReadClient,
  ScriptedWallet,
  successfulReceipt,
  transactionHash,
} from "./engine.test-fixture";
import {
  directPlan,
  INPUT_ATOMIC,
  NOW_SEC,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";

async function input(wallet: ScriptedWallet, read: ScriptedReadClient) {
  wallet.connectReadClient(read);
  return {
    ...await verifiedExecutionInput(directPlan),
    wallet,
    readClient: read,
    nowSec: () => NOW_SEC,
    waitForReceiptPoll: async () => {},
  };
}

function supplyScenario(read: ScriptedReadClient, wallet: ScriptedWallet, byte: number) {
  const hash = transactionHash(byte);
  wallet.hashes.push(hash);
  read.latestBlocks.push(90n, 90n, 101n);
  read.allowance(usdt0, pool, 90n, INPUT_ATOMIC);
  read.balance(usdt0, 90n, 100_000_000n);
  read.scaledBalance(aUsdt0, 90n, 0n);
  read.receipts(hash, successfulReceipt(100n));
  return hash;
}

describe("execution block reference recovery", () => {
  it("does not broadcast when the pinned preflight block changes during state capture", async () => {
    class ReorgDuringPreflightClient extends ScriptedReadClient {
      private reorged = false;

      override async readContract(request: Parameters<ScriptedReadClient["readContract"]>[0]) {
        const response = await super.readContract(request);
        if (request.blockNumber === 90n && request.functionName === "balanceOf" &&
          !this.reorged) {
          this.reorged = true;
          this.blockHashChanges.set(90n, `0x${"ef".repeat(32)}`);
        }
        return response;
      }
    }
    const read = new ReorgDuringPreflightClient([]);
    const wallet = new ScriptedWallet([]);
    wallet.hashes.push(transactionHash(89));
    read.latestBlocks.push(90n, 90n);
    read.allowance(usdt0, pool, 90n, INPUT_ATOMIC);
    read.balance(usdt0, 90n, 100_000_000n);
    read.scaledBalance(aUsdt0, 90n, 0n);

    await expect(executeRoutePlanV2(await input(wallet, read))).rejects.toThrow(
      "preflight block changed",
    );
    expect(wallet.sendCount).toBe(0);
  });

  it("rechecks the preflight block after gas estimation immediately before broadcast", async () => {
    const read = new ScriptedReadClient([]);
    class ReorgDuringEstimateWallet extends ScriptedWallet {
      private reorged = false;

      override async request(request: Parameters<ScriptedWallet["request"]>[0]) {
        const response = await super.request(request);
        if (request.method === "eth_estimateGas" && !this.reorged) {
          this.reorged = true;
          read.blockHashChanges.set(90n, `0x${"ef".repeat(32)}`);
        }
        return response;
      }
    }
    const wallet = new ReorgDuringEstimateWallet([]);
    wallet.hashes.push(transactionHash(90));
    read.latestBlocks.push(90n, 90n);
    read.allowance(usdt0, pool, 90n, INPUT_ATOMIC);
    read.balance(usdt0, 90n, 100_000_000n);
    read.scaledBalance(aUsdt0, 90n, 0n);

    await expect(executeRoutePlanV2(await input(wallet, read))).rejects.toThrow(
      "preflight block changed",
    );
    expect(wallet.sendCount).toBe(0);
  });

  it("rejects a receipt block reorged during post-state reads", async () => {
    class ReorgDuringStateReadClient extends ScriptedReadClient {
      private reorged = false;

      override async readContract(request: Parameters<ScriptedReadClient["readContract"]>[0]) {
        if (request.blockNumber === 100n && !this.reorged) {
          this.reorged = true;
          this.blockHashChanges.set(100n, `0x${"ef".repeat(32)}`);
        }
        return super.readContract(request);
      }
    }
    const read = new ReorgDuringStateReadClient([]);
    const wallet = new ScriptedWallet([]);
    supplyScenario(read, wallet, 79);
    read.balance(usdt0, 100n, 50_000_000n);
    read.scaledBalance(aUsdt0, 100n, INPUT_ATOMIC);

    const result = await executeRoutePlanV2(await input(wallet, read));

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "receipt-reorged" },
    });
  });

  it("rejects an orphaned captured preflight block before post-state reads", async () => {
    const events: string[] = [];
    class ReorgPreflightAfterSubmissionClient extends ScriptedReadClient {
      private reorged = false;

      override async getReceipt(hash: Parameters<ScriptedReadClient["getReceipt"]>[0]) {
        if (!this.reorged) {
          this.reorged = true;
          this.blockHashChanges.set(90n, `0x${"ef".repeat(32)}`);
        }
        return super.getReceipt(hash);
      }
    }
    const read = new ReorgPreflightAfterSubmissionClient(events);
    const wallet = new ScriptedWallet(events);
    supplyScenario(read, wallet, 88);

    const result = await executeRoutePlanV2(await input(wallet, read));

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "receipt-reorged" },
    });
    expect(events).not.toContain(`read:balanceOf:${usdt0.toLowerCase()}:100`);
  });

  it("re-pins deployments at the receipt block before trusting evidence", async () => {
    class ReceiptUpgradeClient extends ScriptedReadClient {
      override async getRuntimeCodeHash(
        request: Parameters<ScriptedReadClient["getRuntimeCodeHash"]>[0],
      ) {
        if (request.blockNumber === 100n &&
          request.address.toLowerCase() === pool.toLowerCase()) {
          return `0x${"ff".repeat(32)}` as const;
        }
        return super.getRuntimeCodeHash(request);
      }
    }
    const read = new ReceiptUpgradeClient([]);
    const wallet = new ScriptedWallet([]);
    supplyScenario(read, wallet, 80);
    read.balance(usdt0, 100n, 50_000_000n);
    read.scaledBalance(aUsdt0, 100n, INPUT_ATOMIC);

    const result = await executeRoutePlanV2(await input(wallet, read));

    expect(result).toMatchObject({
      status: "failed",
      failure: {
        code: "receipt-attribution",
        message: expect.stringContaining("runtime code hash mismatch"),
      },
    });
  });

  it("brackets receipt-block deployment reads before post-state validation", async () => {
    const events: string[] = [];
    class ReorgDuringDeploymentClient extends ScriptedReadClient {
      private reorged = false;

      override async getRuntimeCodeHash(
        request: Parameters<ScriptedReadClient["getRuntimeCodeHash"]>[0],
      ) {
        const hash = await super.getRuntimeCodeHash(request);
        if (request.blockNumber === 100n && !this.reorged) {
          this.reorged = true;
          this.blockHashChanges.set(100n, `0x${"ef".repeat(32)}`);
        }
        return hash;
      }
    }
    const read = new ReorgDuringDeploymentClient(events);
    const wallet = new ScriptedWallet(events);
    supplyScenario(read, wallet, 87);

    const result = await executeRoutePlanV2(await input(wallet, read));

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "receipt-reorged" },
    });
    expect(events).not.toContain(`read:balanceOf:${usdt0.toLowerCase()}:100`);
  });
});
