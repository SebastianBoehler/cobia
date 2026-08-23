import { commitment, type GeneralAssetPolicyV1, type GeneralAssetProgramV1 } from "@cobia/domain";
import { RegisteredAdapterManifestV1Schema } from "@cobia/solvers";
import { z } from "zod";
import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hash,
} from "viem";
import { mainnet } from "viem/chains";
import { nodeCommerceFetchV1, nodeDnsResolverV1 } from "../commerce/node-commerce-fetch";
import { readGeneralAssetRpcConfig } from "../env";
import { createLifiBrokerV1 } from "../lifi/broker";
import { xLayer } from "../chain/xlayer";
import type { BridgeDeliveryMonitorV4, BridgeTransactionReceiptV4 } from "./bridge-delivery-verifier";
import { GeneralAssetEvidenceArtifactV1Schema } from "./revalidate-stage-evidence";

const LIFI_EVENTS = parseAbi([
  "event LiFiTransferStarted((bytes32 transactionId,string bridge,string integrator,address referrer,address sendingAssetId,address receiver,uint256 minAmount,uint256 destinationChainId,bool hasSourceSwaps,bool hasDestinationCall) bridgeData)",
  "event LiFiTransferCompleted(bytes32 indexed transactionId,address receivingAssetId,address receiver,uint256 amount,uint256 timestamp)",
]);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as Hash);
const ChainSchema = z.union([z.literal(1), z.literal(196)]);
const StatusSchema = z.object({ status: z.string(), substatus: z.string().optional() }).passthrough();
const CompletedStatusSchema = z.object({
  status: z.literal("DONE"),
  substatus: z.literal("COMPLETED"),
  transactionId: HashSchema,
  sending: z.object({ txHash: HashSchema, chainId: ChainSchema }).passthrough(),
  receiving: z.object({ txHash: HashSchema, chainId: ChainSchema }).passthrough(),
}).passthrough();

function decoded(log: BridgeTransactionReceiptV4["logs"][number]) {
  try {
    return decodeEventLog({ abi: LIFI_EVENTS, data: log.data, topics: log.topics as never, strict: true });
  } catch {
    return undefined;
  }
}

function sourceMessageId(receipt: BridgeTransactionReceiptV4, emitter: Address): Hash | null {
  for (const log of receipt.logs) {
    if (log.address !== emitter) continue;
    const event = decoded(log);
    if (event?.eventName !== "LiFiTransferStarted") continue;
    const bridgeData = event.args.bridgeData;
    return bridgeData.transactionId;
  }
  return null;
}

function destinationDelivery(
  receipt: BridgeTransactionReceiptV4,
  emitters: readonly { address: Address; runtimeCodeHash: Hash }[],
) {
  for (const log of receipt.logs) {
    const emitter = emitters.find(({ address }) => address === log.address);
    if (!emitter) continue;
    const event = decoded(log);
    if (event?.eventName !== "LiFiTransferCompleted") continue;
    return {
      messageId: event.args.transactionId,
      recipient: event.args.receiver,
      token: event.args.receivingAssetId,
      amountAtomic: event.args.amount.toString(),
      emitter: emitter.address,
      emitterRuntimeCodeHash: emitter.runtimeCodeHash,
    };
  }
  return null;
}

function chainClients() {
  const config = readGeneralAssetRpcConfig();
  return {
    1: createPublicClient({ chain: mainnet,
      transport: http(config.ETHEREUM_RPC_URL, { timeout: 15_000 }), cacheTime: 0 }),
    196: createPublicClient({ chain: xLayer,
      transport: http(config.XLAYER_RPC_URL, { timeout: 15_000 }), cacheTime: 0 }),
  };
}

function monitorReader(): BridgeDeliveryMonitorV4["reader"] {
  const clients = chainClients();
  return {
    async receipt(chainId, transactionHash) {
      try {
        const receipt = await clients[chainId].getTransactionReceipt({ hash: transactionHash });
        return { transactionHash, success: receipt.status === "success",
          blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash,
          transactionIndex: receipt.transactionIndex,
          logs: receipt.logs.map((log) => ({ address: log.address,
            topics: [...log.topics] as Hash[], data: log.data })) };
      } catch (error) {
        if (error instanceof Error && error.name === "TransactionReceiptNotFoundError") return undefined;
        throw error;
      }
    },
    async canonicalBlockHash(chainId, blockNumber) {
      const block = await clients[chainId].getBlock({ blockNumber: BigInt(blockNumber) });
      if (!block.hash) throw new Error("Bridge block has no canonical hash");
      return block.hash;
    },
    async currentBlockNumber(chainId) {
      return (await clients[chainId].getBlockNumber()).toString();
    },
    async tokenBalance(chainId, token, owner, blockNumber) {
      return (await clients[chainId].readContract({ address: token, abi: erc20Abi,
        functionName: "balanceOf", args: [owner], blockNumber: BigInt(blockNumber) })).toString();
    },
    async codeHash(chainId, address, blockNumber) {
      const code = await clients[chainId].getCode({ address, blockNumber: BigInt(blockNumber) });
      return !code || code === "0x" ? null : keccak256(code);
    },
  };
}

export function createProductionBridgeDeliveryMonitorV4(input: {
  policy: GeneralAssetPolicyV1;
  program: GeneralAssetProgramV1;
  stageId: Hash;
  artifacts: readonly { kind: string; artifactHash: string; payload: unknown }[];
}): BridgeDeliveryMonitorV4 {
  const evidenceRow = input.artifacts.find(({ kind }) => kind === "evidence");
  if (!evidenceRow || evidenceRow.artifactHash !== commitment(evidenceRow.payload)) {
    throw new Error("Committed bridge evidence artifact is unavailable");
  }
  const evidence = GeneralAssetEvidenceArtifactV1Schema.parse(evidenceRow.payload);
  const manifest = RegisteredAdapterManifestV1Schema.parse(evidence.manifest);
  if (commitment(manifest) !== input.policy.manifestHash ||
      input.program.manifestHash !== input.policy.manifestHash) {
    throw new Error("Bridge manifest does not match the signed policy");
  }
  const stage = input.program.stages.find(({ stageId }) => stageId === input.stageId);
  if (!stage || stage.delivery.kind !== "bridge") throw new Error("Bridge stage is unavailable");
  const entry = manifest.entries.find((candidate) => candidate.adapter.id === stage.adapter.id &&
    candidate.adapter.version === stage.adapter.version && candidate.chainId === stage.chainId &&
    candidate.target === stage.target);
  const registration = entry?.bridgeDelivery;
  if (!registration || registration.destinationChainId !== stage.delivery.destinationChainId) {
    throw new Error("Bridge delivery semantics are not registered");
  }
  const broker = createLifiBrokerV1({ fetcher: nodeCommerceFetchV1, dnsResolver: nodeDnsResolverV1 });
  return {
    async locate(locatorInput) {
      const response = await broker.request({ path: "/v1/status", query: {
        txHash: locatorInput.sourceTransactionHash,
        fromChain: locatorInput.sourceChainId.toString(),
        toChain: locatorInput.destinationChainId.toString(),
      } });
      const status = StatusSchema.parse(response.value);
      if (status.status !== "DONE" || status.substatus !== "COMPLETED") return undefined;
      const completed = CompletedStatusSchema.parse(response.value);
      if (completed.sending.txHash !== locatorInput.sourceTransactionHash ||
          completed.sending.chainId !== locatorInput.sourceChainId ||
          completed.receiving.chainId !== locatorInput.destinationChainId) {
        throw new Error("LI.FI bridge locator does not match the committed route");
      }
      return { sourceTransactionHash: locatorInput.sourceTransactionHash,
        destinationChainId: locatorInput.destinationChainId,
        messageId: completed.transactionId,
        deliveryTransactionHash: completed.receiving.txHash };
    },
    semantics: {
      sourceMessageId: (receipt) => sourceMessageId(receipt, stage.target),
      destinationDelivery: (receipt) => destinationDelivery(receipt, registration.destinationEmitters),
    },
    reader: monitorReader(),
  };
}
