import { SolverDecisionV1Schema, type SolverDecisionV1, type SolverIntentV1 } from "@cobia/solver-sdk";
import { readFile, writeFile } from "node:fs/promises";
import { solve } from "./strategy";

export const REFERENCE_CAPABILITIES = [
  "aave-v3.positions@1",
  "aave-v3.supply@1",
  "curve-stableswap-ng.exact-input@1",
  "curve-stableswap-ng.liquidity@1",
  "evm.raw@1",
  "general-asset@1",
  "general.evm-program@1",
  "okx.dex-routing@1",
  "okx.dex@1",
  "policy.capability-composition@1",
  "uniswap-v3.exact-input@1",
  "uniswap-v3.swaps@1",
  "xlayer.native-okb@1",
] as const;

export const REFERENCE_CAPABILITY_DECLARATION = {
  version: 1 as const,
  declarationKind: "operator" as const,
  capabilities: REFERENCE_CAPABILITIES,
  openLane: "transaction-program/evm.raw@1" as const,
};

interface Dependencies {
  write(value: string): void;
  solve(intent: SolverIntentV1): Promise<SolverDecisionV1>;
}

function option(args: readonly string[], name: string) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Route tool requires ${name}`);
  return value;
}

export async function runRouteTool(args: readonly string[], dependencies: Dependencies = {
  write: (value) => process.stdout.write(value),
  solve,
}) {
  const command = args[0];
  if (command === "capabilities") {
    dependencies.write(`${JSON.stringify(REFERENCE_CAPABILITY_DECLARATION)}\n`);
    return;
  }
  if (command !== "solve") throw new Error("Route tool command must be capabilities or solve");
  const intentPath = option(args, "--intent");
  const outputPath = option(args, "--output");
  const intent = JSON.parse(await readFile(intentPath, "utf8")) as SolverIntentV1;
  const decision = SolverDecisionV1Schema.parse(await dependencies.solve(intent));
  await writeFile(outputPath, `${JSON.stringify(decision, null, 2)}\n`, { mode: 0o600 });
  dependencies.write(`${JSON.stringify({ version: 1, output: outputPath,
    decision: decision.decision })}\n`);
}
