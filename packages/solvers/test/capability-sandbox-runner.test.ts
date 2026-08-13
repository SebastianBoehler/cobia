import { commitment } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import {
  capabilityProgramCommitmentV1,
  runCapabilitySandboxV1,
  type CodingAgentSandboxV1,
} from "../src";
import { routeInputAsset, routePolicy, routeRegistryHash, routeSnapshot } from "./routing-v2-fixtures";

const executor = "0x4444444444444444444444444444444444444444";

function program() {
  return {
    version: 1,
    requestId: routePolicy.requestId,
    chainId: 196,
    policyHash: commitment(routePolicy),
    manifestHash: routeRegistryHash,
    owner: routePolicy.owner,
    executor,
    pinnedBlock: { number: routeSnapshot.blockNumber, hash: routeSnapshot.blockHash },
    deadline: routePolicy.deadline,
    nonce: `0x${"77".repeat(32)}`,
    input: { token: routeInputAsset, atomic: "50000000" },
    actions: [{
      capabilityId: "aave-v3.supply",
      capabilityVersion: 1,
      valueAtomic: "0",
      parameters: { asset: routeInputAsset, amountAtomic: "50000000" },
    }],
    constraints: [{
      token: "0x5555555555555555555555555555555555555555",
      account: routePolicy.owner,
      minimumIncreaseAtomic: "49999999",
    }],
  } as const;
}

function evidence() {
  return {
    version: 1,
    programHash: capabilityProgramCommitmentV1(program()),
    chainId: 196,
    blockNumber: routeSnapshot.blockNumber,
    blockHash: routeSnapshot.blockHash,
    traceHash: `0x${"88".repeat(32)}`,
    stateDiffHash: `0x${"99".repeat(32)}`,
    eventsHash: `0x${"aa".repeat(32)}`,
    balanceDeltas: [],
    deployments: [],
  } as const;
}

function sandbox(files: Record<string, string>) {
  const writes: Record<string, string> = {};
  const value: CodingAgentSandboxV1 & { writes: typeof writes; stopped: boolean } = {
    writes,
    stopped: false,
    async writeFile(path, content) { writes[path] = content; },
    async run(command) {
      return { exitCode: 0, stdout: command.args.join(" "), stderr: "" };
    },
    async readFile(path) {
      const content = files[path];
      if (!content) throw new Error(`missing ${path}`);
      return { content, isSymbolicLink: false };
    },
    async stop() { value.stopped = true; },
  };
  return value;
}

describe("open capability sandbox runner", () => {
  it("gives the agent only canonical public task data and records every shell command", async () => {
    const agent = sandbox({
      "out/program.json": JSON.stringify(program()),
      "out/evidence.json": JSON.stringify(evidence()),
      "out/run-manifest.json": JSON.stringify({
        version: 1,
        dependencies: [{ name: "viem", version: "2.55.11" }],
        sources: [],
        generatedFiles: ["out/search.mjs"],
      }),
      "out/search.mjs": "console.log('route')",
    });
    const generate = vi.fn(async (environment: CodingAgentSandboxV1) => {
      await environment.run({ cmd: "bash", args: ["-lc", "node search.mjs"], timeoutMs: 30_000 });
      return { responseIds: ["resp_1"], commandCount: 1 };
    });

    const result = await runCapabilitySandboxV1({
      sandbox: agent,
      generate,
      policy: routePolicy,
      snapshot: routeSnapshot,
      wallet: routePolicy.owner,
      portfolio: { balances: [], allowances: [], positions: [] },
      manifest: { registryHash: routeRegistryHash },
      executor,
    });

    const task = agent.writes["in/task.json"]!;
    expect(task).not.toContain("privateKey");
    expect(task).not.toContain("OPENAI");
    expect(task).not.toContain("XLAYER_RPC_URL");
    expect(JSON.parse(task)).toMatchObject({
      wallet: routePolicy.owner,
      executor,
      rpc: { mode: "brokered-read-only", chainId: 196 },
    });
    expect(result.provenance.commands).toHaveLength(1);
    expect(result.provenance.modelResponseIds).toEqual(["resp_1"]);
    expect(agent.stopped).toBe(true);
  });

  it("rejects symlinked or traversing artifacts and always destroys the sandbox", async () => {
    const agent = sandbox({
      "out/program.json": JSON.stringify(program()),
      "out/evidence.json": JSON.stringify(evidence()),
      "out/run-manifest.json": JSON.stringify({
        version: 1, dependencies: [], sources: [], generatedFiles: ["../secret"],
      }),
    });
    await expect(runCapabilitySandboxV1({
      sandbox: agent,
      generate: async () => ({ responseIds: [], commandCount: 0 }),
      policy: routePolicy,
      snapshot: routeSnapshot,
      wallet: routePolicy.owner,
      portfolio: { balances: [], allowances: [], positions: [] },
      manifest: { registryHash: routeRegistryHash },
      executor,
    })).rejects.toThrow("safe workspace path");
    expect(agent.stopped).toBe(true);
  });
});
