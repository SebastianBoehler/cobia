import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const PrivateKeySchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value as Hex);

const solverKeys = {
  "deterministic-v2": "DETERMINISTIC_SOLVER_PRIVATE_KEY",
  "agentic-v2": "AI_SOLVER_PRIVATE_KEY",
} as const;

export function trustedRouteSolverAddress(
  solverId: string,
  source: Record<string, string | undefined> = process.env,
): Address {
  const keyName = solverKeys[solverId as keyof typeof solverKeys];
  if (!keyName) throw new Error(`Route solver ${solverId} is not trusted`);
  const parsed = PrivateKeySchema.safeParse(source[keyName]);
  if (!parsed.success) throw new Error(`Missing or invalid solver configuration: ${keyName}`);
  return privateKeyToAccount(parsed.data).address;
}
