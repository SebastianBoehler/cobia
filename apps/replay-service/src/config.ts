import { z } from "zod";

const ConfigSchema = z.object({
  REPLAY_SERVICE_SECRET: z.string().min(32),
  XLAYER_RPC_URL: z.url(),
  ETHEREUM_RPC_URL: z.url(),
  BASE_RPC_URL: z.url(),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  REPLAY_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
});

export type ReplayServiceConfig = z.infer<typeof ConfigSchema>;

export function readReplayServiceConfig(
  source: Record<string, string | undefined> = process.env,
): ReplayServiceConfig {
  return ConfigSchema.parse(source);
}

export function rpcForChain(config: ReplayServiceConfig, chainId: 1 | 196 | 8453) {
  if (chainId === 1) return config.ETHEREUM_RPC_URL;
  if (chainId === 8453) return config.BASE_RPC_URL;
  return config.XLAYER_RPC_URL;
}
