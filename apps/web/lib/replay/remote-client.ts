import type { CapabilityProgramReplayResultV2, CompiledCapabilityActionV1 } from "@cobia/solvers";

type TransactionReplayResult = Awaited<ReturnType<
  typeof import("../open-exchange/transaction-fork-replay").replayOpenTransactionProgramV1
>>;

function config(source: Record<string, string | undefined> = process.env) {
  const origin = source.REPLAY_SERVICE_ORIGIN;
  const secret = source.REPLAY_SERVICE_SECRET;
  if (!origin || !secret || secret.length < 32) throw new Error("Remote replay service is not configured");
  const url = new URL(origin);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!localHttp && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/") {
    throw new Error("Replay service origin must be HTTPS or loopback HTTP without credentials");
  }
  return { origin: url.origin, secret };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { origin, secret } = config();
  const response = await fetch(new URL(path, origin), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const value = await response.json() as { error?: string; message?: string } | T;
  if (!response.ok) {
    const failure = value as { error?: string; message?: string };
    throw new Error(failure.message ?? `Replay service returned HTTP ${response.status}`);
  }
  return value as T;
}

export function replayTransactionRemotely(input: {
  chainId: 1 | 196 | 8453;
  blockNumber: string;
  program: unknown;
  evidence: unknown;
  providerArtifacts: unknown;
  snapshot: unknown;
}) {
  return post<TransactionReplayResult>("/v1/replays/transaction", input);
}

export function replayCapabilityRemotely(input: {
  blockNumber: string;
  program: unknown;
  compiled: readonly CompiledCapabilityActionV1[];
}) {
  return post<CapabilityProgramReplayResultV2>("/v1/replays/capability", input);
}
