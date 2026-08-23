import { createPublicClient, erc20Abi, http, type Address, type Hash, type Hex } from "viem";
import { mainnet } from "viem/chains";
import type { createGeneralAssetExecutionRepository } from "../db/general-asset-executions";
import { readMarketConfig } from "../env";
import { xLayer } from "../chain/xlayer";
import {
  verifyBridgeDeliveryV4,
  type BridgeDeliveryMonitorV4,
} from "./bridge-delivery-verifier";
import type { ReceiptLogV4 } from "./receipt-reconciler";
import type { GeneralAssetExecutionBundleV4 } from "./stage-artifact";

type Repository = ReturnType<typeof createGeneralAssetExecutionRepository>;

export interface GeneralAssetStageChainReaderV4 {
  readTransaction(hash: Hash): Promise<{
    sender: Address; nonce: string; target: Address; valueAtomic: string; calldata: Hex;
  }>;
  readReceipt(hash: Hash): Promise<undefined | {
    success: boolean; blockNumber: string; blockHash: Hash; transactionIndex: number;
    logs: ReceiptLogV4[];
  }>;
  readCurrentBlockNumber(): Promise<string>;
  readCanonicalBlockHash(blockNumber: string): Promise<Hash>;
  readTokenBalance(token: Address, owner: Address, blockNumber: string): Promise<string>;
}

export async function reconcileGeneralAssetStageLiveV4(input: {
  bundle: GeneralAssetExecutionBundleV4;
  stageId: Hash;
  repository: Pick<Repository, "getProgram" | "reconcileStageReceipt" |
    "recordBridgeDelivery" | "recordBridgeFailure">;
  reader: GeneralAssetStageChainReaderV4;
  bridge?: BridgeDeliveryMonitorV4;
}) {
  const stage = input.bundle.stages.find(({ stageId }) => stageId === input.stageId);
  if (!stage) throw new Error("Attested stage is unavailable");
  const program = await input.repository.getProgram(input.bundle.programId);
  const stored = program?.stages.find(({ stageId }) => stageId === input.stageId);
  if (!stored?.transactionHash) throw new Error("Stage has no submitted transaction");
  const transactionHash = stored.transactionHash as Hash;
  const receipt = await input.reader.readReceipt(transactionHash);
  if (!receipt) return stored;
  const [transaction, currentBlockNumber, canonicalBlockHash] = await Promise.all([
    input.reader.readTransaction(transactionHash),
    input.reader.readCurrentBlockNumber(),
    input.reader.readCanonicalBlockHash(receipt.blockNumber),
  ]);
  let output;
  if (stage.delivery.kind === "none") {
    const receiptBlock = BigInt(receipt.blockNumber);
    if (receiptBlock === 0n) throw new Error("Final output block is invalid");
    const [beforeAtomic, afterAtomic] = await Promise.all([
      input.reader.readTokenBalance(input.bundle.finalOutput.token, input.bundle.owner,
        (receiptBlock - 1n).toString()),
      input.reader.readTokenBalance(input.bundle.finalOutput.token, input.bundle.owner,
        receipt.blockNumber),
    ]);
    output = {
      expected: { token: input.bundle.finalOutput.token,
        minimumIncreaseAtomic: input.bundle.finalOutput.minimumAtomic },
      observed: { token: input.bundle.finalOutput.token, beforeAtomic, afterAtomic },
    };
  }
  const reconciled = await input.repository.reconcileStageReceipt(input.bundle.programId, stage.stageId, {
    observed: { chainId: stage.chainId, transactionHash, ...transaction, ...receipt },
    currentBlockNumber,
    canonicalBlockHash,
    ...(output ? { output } : {}),
  });
  if (stage.delivery.kind !== "bridge" ||
      !["finalized", "delivered"].includes(reconciled.state) || !input.bridge) return reconciled;
  const locator = await input.bridge.locate({
    sourceChainId: stage.chainId,
    sourceTransactionHash: transactionHash,
    destinationChainId: stage.delivery.destinationChainId,
  });
  const verification = await verifyBridgeDeliveryV4({
    expected: {
      sourceChainId: stage.chainId,
      sourceTransactionHash: transactionHash,
      destinationChainId: stage.delivery.destinationChainId,
      recipient: stage.delivery.recipient,
      token: stage.delivery.token,
      minimumAtomic: stage.delivery.minimumAtomic,
      requiredConfirmations: stage.requiredConfirmations,
    },
    sourceReceipt: { transactionHash, ...receipt },
    locator,
    semantics: input.bridge.semantics,
    reader: input.bridge.reader,
  });
  if (verification.status === "pending") return reconciled;
  if (verification.status === "reconciliation_required") {
    return input.repository.recordBridgeFailure(input.bundle.programId, stage.stageId, verification.code);
  }
  const proof = verification.evidence;
  return input.repository.recordBridgeDelivery(input.bundle.programId, stage.stageId, {
    messageId: proof.messageId,
    sourceTransactionHash: proof.sourceTransactionHash,
    destinationChainId: proof.destinationChainId,
    recipient: proof.recipient,
    token: proof.token,
    amountAtomic: proof.amountAtomic,
    deliveryTransactionHash: proof.deliveryTransactionHash,
  });
}

export function createGeneralAssetStageChainReaderV4(chainId: 1 | 196): GeneralAssetStageChainReaderV4 {
  const config = readMarketConfig();
  const client = chainId === 1
    ? createPublicClient({ chain: mainnet,
      transport: http(config.ETHEREUM_RPC_URL, { timeout: 15_000 }), cacheTime: 0 })
    : createPublicClient({ chain: xLayer,
      transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }), cacheTime: 0 });
  return {
    async readTransaction(hash) {
      const transaction = await client.getTransaction({ hash });
      if (!transaction.to) throw new Error("Stage transaction target is unavailable");
      return { sender: transaction.from, nonce: transaction.nonce.toString(), target: transaction.to,
        valueAtomic: transaction.value.toString(), calldata: transaction.input };
    },
    async readReceipt(hash) {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        return { success: receipt.status === "success", blockNumber: receipt.blockNumber.toString(),
          blockHash: receipt.blockHash, transactionIndex: receipt.transactionIndex,
          logs: receipt.logs.map((log) => ({ address: log.address,
            topics: [...log.topics] as Hash[], data: log.data })) };
      } catch (error) {
        if (error instanceof Error && error.name === "TransactionReceiptNotFoundError") return undefined;
        throw error;
      }
    },
    async readCurrentBlockNumber() { return (await client.getBlockNumber()).toString(); },
    async readCanonicalBlockHash(blockNumber) {
      const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
      if (!block.hash) throw new Error("Canonical receipt block has no hash");
      return block.hash;
    },
    async readTokenBalance(token, owner, blockNumber) {
      return (await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf",
        args: [owner], blockNumber: BigInt(blockNumber) })).toString();
    },
  };
}
