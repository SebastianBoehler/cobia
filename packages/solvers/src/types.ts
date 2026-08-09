import type {
  DecisionBundle,
  MarketSnapshot,
  StablecoinPolicy,
} from "@cobia/domain";
import type { Address } from "viem";

export interface SolverInput {
  policy: StablecoinPolicy;
  snapshot: MarketSnapshot;
  nowSec: number;
}

export interface Solver {
  id: string;
  address: Address;
  solve(input: SolverInput): Promise<DecisionBundle>;
}
