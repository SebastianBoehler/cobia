import type { Hash } from "viem";

export type SolverToolResultV1<T> =
  | { status: "ok"; sourceHash: Hash; fetchedAt: number; value: T }
  | { status: "abstained"; code: string; message: string };

export interface SolverToolV1<Input, Output> {
  readonly id: string;
  readonly version: 1;
  run(input: Input): Promise<SolverToolResultV1<Output>>;
}
