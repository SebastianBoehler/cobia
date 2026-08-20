import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareCodexJob } from "../src/codex-job";
import { readCodexDecision } from "../src/codex-output";

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
      toolCommand: ["pnpm", "--silent", "route-tool"],
    });

    expect(job.cwd).toBe(join(root, intentId));
    expect(JSON.parse(await readFile(job.intentPath, "utf8"))).toEqual(intent);
    const guidance = await readFile(join(job.cwd, "AGENTS.md"), "utf8");
    expect(guidance).toContain("decision.json");
    expect(guidance).toContain("pnpm --silent route-tool");
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
});
