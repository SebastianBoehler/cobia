import { SolverDecisionV1Schema, type SolverDecisionV1 } from "@cobia/solver-sdk";
import { readFile } from "node:fs/promises";

export async function readCodexDecision(path: string): Promise<SolverDecisionV1> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error("Codex solver decision is missing or invalid JSON", { cause: error });
  }
  const parsed = SolverDecisionV1Schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Codex solver decision is invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function readExistingCodexDecision(path: string): Promise<SolverDecisionV1 | undefined> {
  try { return await readCodexDecision(path); }
  catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if ((cause as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return undefined;
    throw error;
  }
}
