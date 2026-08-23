import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { REFERENCE_CAPABILITIES, runRouteTool } from "../src/route-tool";

describe("reference route tool", () => {
  it("declares every advertised semantic protocol lane", () => {
    expect(REFERENCE_CAPABILITIES).toEqual([
      "aave-v3.positions@1",
      "aave-v3.supply@1",
      "curve-stableswap-ng.exact-input@1",
      "curve-stableswap-ng.liquidity@1",
      "evm.raw@1",
      "general-asset@1",
      "general.evm-program@1",
      "okx.dex-routing@1",
      "policy.capability-composition@1",
      "uniswap-v3.exact-input@1",
      "uniswap-v3.swaps@1",
      "xlayer.native-okb@1",
    ]);
    expect(new Set(REFERENCE_CAPABILITIES).size).toBe(REFERENCE_CAPABILITIES.length);
    expect([...REFERENCE_CAPABILITIES].sort()).toEqual(REFERENCE_CAPABILITIES);
  });

  it("identifies capability claims as operator declarations and exposes the open lane", async () => {
    const write = vi.fn();

    await runRouteTool(["capabilities"], { write, solve: vi.fn() });

    expect(JSON.parse(write.mock.calls[0]![0])).toEqual({
      version: 1,
      declarationKind: "operator",
      capabilities: REFERENCE_CAPABILITIES,
      openLane: "transaction-program/evm.raw@1",
    });
  });

  it("builds a canonical decision from the immutable job input", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cobia-route-tool-test-"));
    const intentPath = join(cwd, "intent.json");
    const outputPath = join(cwd, "candidate.json");
    const intent = { id: "6e242063-95be-4b0d-95d8-bc94cd3e6416", policy: {}, snapshot: {} };
    await writeFile(intentPath, JSON.stringify(intent));
    const solve = vi.fn(async () => ({
      version: 1 as const, decision: "abstain" as const, reasonCode: "NO_PROFITABLE_ROUTE",
    }));

    await runRouteTool(["solve", "--intent", intentPath, "--output", outputPath], {
      write: vi.fn(), solve,
    });

    expect(solve).toHaveBeenCalledWith(intent);
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual({
      version: 1, decision: "abstain", reasonCode: "NO_PROFITABLE_ROUTE",
    });
  });
});
