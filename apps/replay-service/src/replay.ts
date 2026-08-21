import type { CompiledCapabilityActionV1 } from "@cobia/solvers";
import { replayCapabilityProgramOnForkV2 } from
  "../../web/lib/coding-agent-sandbox/capability-fork-replay-v2";
import { startLocalAnvilFork } from
  "../../web/lib/coding-agent-sandbox/local-anvil-fork";
import { replayOpenTransactionProgramV1 } from
  "../../web/lib/open-exchange/transaction-fork-replay";
import { z } from "zod";
import { rpcForChain, type ReplayServiceConfig } from "./config";

const ChainIdSchema = z.union([z.literal(1), z.literal(196), z.literal(8453)]);
const TransactionReplaySchema = z.object({
  chainId: ChainIdSchema,
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  program: z.unknown(),
  evidence: z.unknown(),
  providerArtifacts: z.unknown(),
  snapshot: z.unknown(),
});
const CapabilityReplaySchema = z.object({
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  program: z.unknown(),
  compiled: z.array(z.unknown()),
});

export async function replayTransaction(body: unknown, config: ReplayServiceConfig) {
  const input = TransactionReplaySchema.parse(body);
  const fork = await startLocalAnvilFork({
    upstreamRpc: rpcForChain(config, input.chainId),
    blockNumber: input.blockNumber,
    chainId: input.chainId,
  });
  try {
    return await replayOpenTransactionProgramV1({ ...input, rpc: fork.rpc });
  } finally {
    await fork.stop();
  }
}

export async function replayCapability(body: unknown, config: ReplayServiceConfig) {
  const input = CapabilityReplaySchema.parse(body);
  const fork = await startLocalAnvilFork({
    upstreamRpc: config.XLAYER_RPC_URL,
    blockNumber: input.blockNumber,
    chainId: 196,
  });
  try {
    return await replayCapabilityProgramOnForkV2({
      program: input.program,
      compiled: input.compiled as CompiledCapabilityActionV1[],
      forkRpc: fork.rpc,
      read: fork.read,
    });
  } finally {
    await fork.stop();
  }
}
