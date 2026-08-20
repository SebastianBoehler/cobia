import type { LifiBrokerV1, LifiPathV1 } from "../lifi/broker";
import type { SolverToolV1 } from "./types";

const PATHS = {
  chains: "/v1/chains",
  tokens: "/v1/tokens",
  tools: "/v1/tools",
  connections: "/v1/connections",
  quote: "/v1/quote",
  status: "/v1/status",
} as const satisfies Record<string, LifiPathV1>;

type Operation = keyof typeof PATHS;
type LifiToolInputV1 = { operation: Operation; query: Readonly<Record<string, string>> };

export function createLifiRoutesToolV1(
  broker: LifiBrokerV1,
): SolverToolV1<LifiToolInputV1, unknown> {
  return {
    id: "lifi.routes",
    version: 1,
    async run(input) {
      try {
        const evidence = await broker.request({ path: PATHS[input.operation], query: input.query });
        return {
          status: "ok",
          sourceHash: evidence.responseHash,
          fetchedAt: evidence.fetchedAt,
          value: evidence.value,
        };
      } catch (error) {
        return {
          status: "abstained",
          code: "LIFI_UNAVAILABLE",
          message: error instanceof Error ? error.message : "LI.FI is unavailable",
        };
      }
    },
  };
}
