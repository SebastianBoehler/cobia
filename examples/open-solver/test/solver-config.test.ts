import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readReferenceSolverConfig, solverOperatingConfigPath,
} from "../src/solver-config";

describe("reference solver config", () => {
  it("keeps worker limits independent from the Codex provider home", () => {
    const bundledPath = "/app/examples/open-solver/codex/config.toml";

    expect(solverOperatingConfigPath({ env: { CODEX_HOME: "/auth/codex" }, bundledPath }))
      .toBe(bundledPath);
    expect(solverOperatingConfigPath({ env: { CODEX_HOME: "/auth/codex",
      COBIA_SOLVER_CONFIG_PATH: "/run/cobia/solver.toml" }, bundledPath }))
      .toBe("/run/cobia/solver.toml");
  });

  it("loads worker limits from the same TOML Codex uses", async () => {
    const root = await mkdtemp(join(tmpdir(), "cobia-solver-config-"));
    const path = join(root, "config.toml");
    await writeFile(path, `model = "gpt-test"
[cobia]
mode = "agentic"
exchange_url = "https://example.com"
solver_id = "solver-one"
display_name = "Solver One"
poll_interval_ms = 1000
job_root = "/jobs"
state_file = "/state.json"
max_parallel_jobs = 3
max_attempts_per_intent = 2
retry_base_ms = 5000
turn_timeout_ms = 120000
risk_level = "balanced"
max_codex_turns_per_intent = 3
max_total_tokens_per_intent = 400000
`);

    await expect(readReferenceSolverConfig(path)).resolves.toMatchObject({
      mode: "agentic", solver_id: "solver-one", max_parallel_jobs: 3, turn_timeout_ms: 120000,
      risk_level: "balanced", max_codex_turns_per_intent: 3,
      max_total_tokens_per_intent: 400000,
    });
  });
});
