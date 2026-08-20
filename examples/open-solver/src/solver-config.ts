import { readFile } from "node:fs/promises";
import { parse } from "smol-toml";
import { z } from "zod";

const PositiveIntegerSchema = z.number().int().positive().safe();
const RiskLevelSchema = z.enum(["conservative", "balanced", "opportunistic"]);

const ReferenceSolverConfigSchema = z.object({
  cobia: z.object({
    exchange_url: z.string().url(),
    solver_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
    display_name: z.string().trim().min(1).max(80),
    poll_interval_ms: PositiveIntegerSchema,
    job_root: z.string().startsWith("/"),
    state_file: z.string().startsWith("/"),
    max_parallel_jobs: PositiveIntegerSchema,
    max_attempts_per_intent: PositiveIntegerSchema,
    retry_base_ms: PositiveIntegerSchema,
    turn_timeout_ms: PositiveIntegerSchema,
    risk_level: RiskLevelSchema,
    max_codex_turns_per_intent: PositiveIntegerSchema.max(8),
    max_total_tokens_per_intent: PositiveIntegerSchema,
  }).strict(),
}).passthrough();

export type ReferenceSolverConfig = z.infer<typeof ReferenceSolverConfigSchema>["cobia"];

export async function readReferenceSolverConfig(path: string): Promise<ReferenceSolverConfig> {
  const document = parse(await readFile(path, "utf8"));
  return ReferenceSolverConfigSchema.parse(document).cobia;
}
