import {
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { EIP1967_IMPLEMENTATION_SLOT } from "../adapters/read-client";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import type {
  ExecutionReadClientV2,
  ExecutionReceiptV2,
  ExecutionTransactionV2,
  ExecutionWalletV2,
} from "./engine-types";
import {
  protocolLogs,
  pool,
  RAY,
  testBlockHash,
} from "./engine-log.test-fixture";
import { OUTPUT_ATOMIC, OWNER } from "./test-fixtures";
import {
  executionFixtureKey as key,
  seedExecutionFixtureDeployments,
} from "./engine-read-fixture-deployments";

export {
  aUsdg,
  aUsdt0,
  pool,
  revertedReceipt,
  router,
  successfulReceipt,
  testBlockHash,
  transactionHash,
} from "./engine-log.test-fixture";

export class ScriptedReadClient implements ExecutionReadClientV2 {
  chainId = 196;
  latestBlocks: bigint[] = [];
  readonly receiptResponses = new Map<Hash, Array<ExecutionReceiptV2 | undefined>>();
  readonly contractResponses = new Map<string, unknown>();
  readonly transactions = new Map<Hash, Omit<ExecutionTransactionV2,
    "blockNumber" | "blockHash" | "transactionIndex">>();
  readonly blockTransactions = new Map<bigint, ExecutionTransactionV2[]>();
  readonly transactionChanges = new Map<Hash, Partial<ExecutionTransactionV2>>();
  readonly receiptChanges = new Map<Hash, Partial<ExecutionReceiptV2>>();
  readonly blockHashChanges = new Map<bigint, Hash>();
  readonly runtimeCodeHashes = new Map<string, Hash>();
  readonly implementationSlots = new Map<string, Hex>();
  readonly missingProtocolLogs = new Set<Hash>();
  readonly swapOutputOverrides = new Map<Hash, bigint>();
  readonly aaveMintIndexOverrides = new Map<Hash, bigint>();
  readonly aaveScaledBalanceBeforeOverrides = new Map<Hash, bigint>();
  pendingNonce = 7n;
  nativeBalance = 10n ** 18n;
  gasPrice = 1_000_000_000n;

  constructor(readonly events: string[]) {
    seedExecutionFixtureDeployments(this.runtimeCodeHashes, this.implementationSlots);
  }

  allowance(
    token: Address,
    spender: Address,
    block: bigint,
    value: bigint,
    owner: Address = OWNER,
  ) {
    this.contractResponses.set(key(token, "allowance", [owner, spender], block), value);
  }

  balance(token: Address, block: bigint, value: bigint, owner: Address = OWNER) {
    this.contractResponses.set(key(token, "balanceOf", [owner], block), value);
  }

  scaledBalance(token: Address, block: bigint, value: bigint) {
    this.contractResponses.set(key(token, "scaledBalanceOf", [OWNER], block), value);
  }

  normalizedIncome(asset: Address, block: bigint, value: bigint) {
    this.contractResponses.set(key(pool, "getReserveNormalizedIncome", [asset], block), value);
  }

  position(block: bigint, input: {
    tokenId?: bigint;
    owner?: Address;
    token0: Address;
    token1: Address;
    fee?: number;
    tickLower?: number;
    tickUpper?: number;
    liquidity: bigint;
  }) {
    const manager = PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address;
    const tokenId = input.tokenId ?? 42n;
    this.contractResponses.set(
      key(manager, "ownerOf", [tokenId], block),
      input.owner ?? OWNER,
    );
    this.contractResponses.set(key(manager, "positions", [tokenId], block), [
      0n,
      "0x0000000000000000000000000000000000000000",
      input.token0,
      input.token1,
      input.fee ?? 100,
      input.tickLower ?? -887272,
      input.tickUpper ?? 887272,
      input.liquidity,
      0n,
      0n,
      0n,
      0n,
    ]);
  }

  receipts(hash: Hash, ...responses: Array<ExecutionReceiptV2 | undefined>) {
    this.receiptResponses.set(hash, responses);
  }

  register(hash: Hash, request: {
    from: Address; to: Address; value: Hex; data: Hex; nonce?: Hex | bigint;
  }) {
    this.transactions.set(hash, {
      hash,
      from: request.from,
      to: request.to,
      value: BigInt(request.value),
      input: request.data,
      nonce: request.nonce === undefined ? 0 : Number(BigInt(request.nonce)),
    });
  }

  async getChainId() { this.events.push("read:chain"); return this.chainId; }

  async getBlockNumber() {
    const block = this.latestBlocks.shift();
    if (block === undefined) throw new Error("No scripted latest block");
    this.events.push(`read:block:${block}`);
    return block;
  }

  async estimateGas() { return 21_000n; }

  async getTransactionCount() { return this.pendingNonce; }
  async getBalance() { return this.nativeBalance; }

  async getGasPrice() { return this.gasPrice; }

  async getBlockTransactions(blockNumber: bigint) {
    return this.blockTransactions.get(blockNumber) ?? [];
  }

  async getBlock({ blockNumber }: { blockNumber: bigint }) {
    this.events.push(`read:block-hash:${blockNumber}`);
    return {
      number: blockNumber,
      hash: this.blockHashChanges.get(blockNumber) ?? testBlockHash(blockNumber),
      timestamp: 1_900_000_000n + blockNumber,
    };
  }

  async getStorageAt(request: { address: Address; slot: Hex; blockNumber: bigint }) {
    if (request.slot !== EIP1967_IMPLEMENTATION_SLOT) throw new Error("Unexpected slot");
    this.events.push(`read:slot:${request.address.toLowerCase()}:${request.blockNumber}`);
    return this.implementationSlots.get(request.address.toLowerCase());
  }

  async getRuntimeCodeHash(request: { address: Address; blockNumber: bigint }) {
    this.events.push(`read:code:${request.address.toLowerCase()}:${request.blockNumber}`);
    return this.runtimeCodeHashes.get(request.address.toLowerCase());
  }

  private receiptTemplate(hash: Hash) {
    const responses = this.receiptResponses.get(hash);
    if (!responses?.length) return undefined;
    return responses.length > 1 ? responses.shift() : responses[0];
  }

  async getReceipt(hash: Hash) {
    this.events.push(`read:receipt:${hash}`);
    const template = this.receiptTemplate(hash);
    const transaction = this.transactions.get(hash);
    if (!template || !transaction) return template;
    const receipt = {
      ...template,
      transactionHash: hash,
      from: transaction.from,
      to: transaction.to,
      blockHash: testBlockHash(template.blockNumber),
    };
    return {
      ...receipt,
      logs: template.status === "success" && !this.missingProtocolLogs.has(hash)
        ? protocolLogs(
          { ...transaction, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
            transactionIndex: receipt.transactionIndex },
          this.swapOutputOverrides.get(hash) ?? OUTPUT_ATOMIC,
          this.aaveMintIndexOverrides.get(hash) ?? RAY,
          this.aaveScaledBalanceBeforeOverrides.get(hash) ?? 0n,
        )
        : [],
      ...this.receiptChanges.get(hash),
    };
  }

  async getTransaction(hash: Hash) {
    this.events.push(`read:transaction:${hash}`);
    const transaction = this.transactions.get(hash);
    const receipt = this.receiptResponses.get(hash)?.findLast(Boolean);
    if (!transaction || !receipt) return undefined;
    return {
      ...transaction,
      blockNumber: receipt.blockNumber,
      blockHash: testBlockHash(receipt.blockNumber),
      transactionIndex: receipt.transactionIndex,
      ...this.transactionChanges.get(hash),
    };
  }

  async readContract(request: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    blockNumber: bigint;
  }) {
    const args = request.args ?? [];
    this.events.push(`read:${request.functionName}:${request.address.toLowerCase()}:${request.blockNumber}`);
    let response = this.contractResponses.get(key(
      request.address, request.functionName, args, request.blockNumber,
    ));
    if (response === undefined && request.functionName === "scaledBalanceOf") {
      response = this.contractResponses.get(key(
        request.address, "balanceOf", args, request.blockNumber,
      ));
    }
    if (response === undefined && request.functionName === "getReserveNormalizedIncome") {
      response = RAY;
    }
    if (response === undefined) throw new Error("No scripted contract response");
    return response;
  }
}

export class ScriptedWallet implements ExecutionWalletV2 {
  chainId = "0xc4";
  chainIds: string[] = [];
  accounts: Address[] = [OWNER];
  hashes: Hash[] = [];
  rejectEstimateAt = -1;
  rejectSendAt = -1;
  estimateCount = 0;
  sendCount = 0;
  private readClient?: ScriptedReadClient;

  constructor(readonly events: string[]) {}

  connectReadClient(readClient: ScriptedReadClient) { this.readClient = readClient; }

  async request(request: { method: string; params?: readonly unknown[] }) {
    if (request.method === "eth_chainId") {
      this.events.push("wallet:chain");
      return this.chainIds.shift() ?? this.chainId;
    }
    if (request.method === "eth_accounts") {
      this.events.push("wallet:accounts");
      return this.accounts;
    }
    if (request.method === "eth_estimateGas") {
      const index = this.estimateCount++;
      this.events.push("wallet:estimate");
      if (index === this.rejectEstimateAt) throw new Error("estimate rejected");
      return "0x5208";
    }
    if (request.method === "eth_sendTransaction") {
      const index = this.sendCount++;
      const transaction = request.params?.[0] as {
        from: Address; to: Address; value: Hex; data: Hex; nonce?: Hex;
      } | undefined;
      this.events.push(`wallet:send:${transaction?.to?.toLowerCase()}`);
      if (index === this.rejectSendAt) throw new Error("wallet rejected");
      const hash = this.hashes.shift();
      if (!hash || !transaction) throw new Error("No scripted transaction hash");
      this.readClient?.register(hash, transaction);
      return hash;
    }
    throw new Error(`Unexpected wallet method ${request.method}`);
  }
}
