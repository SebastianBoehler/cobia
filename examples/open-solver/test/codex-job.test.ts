import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareCodexJob } from "../src/codex-job";
import { readCodexDecision, readExistingCodexDecision } from "../src/codex-output";

const intentId = "6e242063-95be-4b0d-95d8-bc94cd3e6416";
const intent = {
  id: intentId,
  policy: { displayGoal: "Supply 10 USDG", owner: `0x${"11".repeat(20)}` },
  snapshot: { blockNumber: "123" },
} as never;

describe("Codex solver job", () => {
  it("creates an isolated intent workspace with protocol skills and no secret material", async () => {
    const root = await mkdtemp(join(tmpdir(), "cobia-codex-job-test-"));
    const job = await prepareCodexJob({
      root,
      intent,
      skillsSource: join(import.meta.dirname, "..", "skills"),
      exploration: { risk_level: "opportunistic", max_codex_turns_per_intent: 3,
        max_total_tokens_per_intent: 500000 },
    });

    expect(job.cwd).toBe(join(root, intentId));
    expect(JSON.parse(await readFile(job.intentPath, "utf8"))).toEqual(intent);
    const guidance = await readFile(join(job.cwd, "AGENTS.md"), "utf8");
    expect(guidance).toContain("Do not write decision.json");
    expect(job.prompt).toContain("decisionJson");
    expect(job.prompt).toContain("entire final response");
    expect(job.prompt).toContain("Do not call MCP resource-discovery tools");
    expect(guidance).toContain("route MCP tools");
    expect(guidance).toContain("Shell and direct file-reading tools are unavailable");
    expect(guidance).toContain("cobia_route.instructions");
    expect(guidance).toContain("cobia_route.plan");
    expect(guidance).toContain("split signed input budgets across multiple outputs");
    expect(guidance).toContain("optional protocol plugin");
    expect(guidance).toContain("not an allowlist");
    expect(guidance).toContain("Use live web research");
    expect(guidance).toContain("minimumStages");
    expect(guidance).toContain("wallet-transaction stages");
    expect(guidance).not.toContain("return that canonical abstention immediately");
    expect(job.prompt).toContain("Use live web research");
    expect(job.prompt).toContain("cobia_route.instructions");
    expect(job.prompt).toContain("cobia_route.plan");
    expect(job.prompt).not.toContain("return its canonical abstention immediately");
    expect(guidance).toContain("opportunistic");
    expect(guidance).not.toContain("PRIVATE_KEY");
    await expect(readFile(join(job.cwd, ".agents", "skills", "cobia-intent", "SKILL.md"), "utf8"))
      .resolves.toContain("name: cobia-intent");
  });

  it("parses only a canonical solver decision", async () => {
    const root = await mkdtemp(join(tmpdir(), "cobia-codex-output-test-"));
    const path = join(root, "decision.json");
    await writeFile(path, JSON.stringify({
      version: 1,
      decision: "abstain",
      reasonCode: "NO_PROFITABLE_ROUTE",
    }));

    await expect(readCodexDecision(path)).resolves.toEqual({
      version: 1,
      decision: "abstain",
      reasonCode: "NO_PROFITABLE_ROUTE",
    });
    await writeFile(path, JSON.stringify({ version: 1, decision: "abstain", reasonCode: "bad" }));
    await expect(readCodexDecision(path)).rejects.toThrow(/invalid/i);
  });

  it("distinguishes a missing cached decision from an invalid cached decision", async () => {
    const root = await mkdtemp(join(tmpdir(), "cobia-codex-cache-test-"));
    const path = join(root, "decision.json");

    await expect(readExistingCodexDecision(path)).resolves.toBeUndefined();
    await writeFile(path, "not json");
    await expect(readExistingCodexDecision(path)).rejects.toThrow(/invalid JSON/i);
  });
});
