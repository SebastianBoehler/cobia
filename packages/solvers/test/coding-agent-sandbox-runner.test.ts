import { commitment } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { runCodingAgentSandboxV1, type CodingAgentSandboxV1 } from "../src/index";
import { routePolicy, routeSnapshot } from "./routing-v2-fixtures";

const proposal = {
  version: 1,
  requestId: routePolicy.requestId,
  policyHash: commitment(routePolicy),
  chainId: 196,
  owner: routePolicy.owner,
  deadline: routePolicy.deadline,
  calls: [{ to: routePolicy.asset, valueAtomic: "0", data: "0x095ea7b300000000" }],
  minimumFinalBalances: [],
};
const evidence = {
  version: 1,
  proposalHash: commitment(proposal),
  chainId: 196,
  blockNumber: routeSnapshot.blockNumber,
  blockHash: routeSnapshot.blockHash,
  traceHash: `0x${"11".repeat(32)}`,
  stateDiffHash: `0x${"22".repeat(32)}`,
  finalBalances: [],
  deployments: [],
};

function sandbox(files: Record<string, string>): CodingAgentSandboxV1 & {
  writes: Record<string, string>;
  stopped: boolean;
} {
  const writes: Record<string, string> = {};
  return {
    writes,
    stopped: false,
    async writeFile(path, content) { writes[path] = content; },
    async run(command) {
      expect(command.timeoutMs).toBe(30_000);
      return { exitCode: 0, stdout: "agent output", stderr: "" };
    },
    async readFile(path) {
      const value = files[path];
      if (value === undefined) throw new Error(`missing ${path}`);
      return { content: value, isSymbolicLink: false };
    },
    async stop() { this.stopped = true; },
  };
}

describe("coding-agent sandbox runner", () => {
  it("captures a constrained sandbox proposal without putting a signing secret in its task file", async () => {
    const agent = sandbox({
      "out/proposal.json": JSON.stringify(proposal),
      "out/evidence.json": JSON.stringify(evidence),
      "out/run-manifest.json": JSON.stringify({
        version: 1,
        commands: ["pnpm install viem@2.55.11", "node search-route.mjs"],
        dependencies: [{ name: "viem", version: "2.55.11" }],
        sources: [{ url: "https://github.com/aave-dao/aave-v3-origin", sha256: `0x${"33".repeat(32)}` }],
        generatedFiles: ["out/search-route.mjs"],
      }),
      "out/search-route.mjs": "console.log('route')",
    });

    const result = await runCodingAgentSandboxV1({
      sandbox: agent,
      command: { cmd: "cobia-agent", args: ["--task", "in/task.json"], timeoutMs: 30_000 },
      policy: routePolicy,
      snapshot: routeSnapshot,
      wallet: routePolicy.owner,
      portfolio: { balances: [], allowances: [], positions: [] },
      manifest: { version: 1, chainId: 196, deployments: [] },
    });

    expect(JSON.parse(agent.writes["in/task.json"]!)).toMatchObject({
      wallet: routePolicy.owner,
      block: { number: routeSnapshot.blockNumber, hash: routeSnapshot.blockHash },
    });
    expect(agent.writes["in/task.json"]).not.toContain("privateKey");
    expect(result.provenance).toMatchObject({
      command: { exitCode: 0 },
      generatedFiles: [{ path: "out/search-route.mjs" }],
    });
    expect(agent.stopped).toBe(true);
  });

  it("rejects a path traversal claim from the untrusted run manifest", async () => {
    const agent = sandbox({
      "out/proposal.json": JSON.stringify(proposal),
      "out/evidence.json": JSON.stringify(evidence),
      "out/run-manifest.json": JSON.stringify({
        version: 1, commands: [], dependencies: [], sources: [], generatedFiles: ["../credentials"],
      }),
    });
    await expect(runCodingAgentSandboxV1({
      sandbox: agent,
      command: { cmd: "cobia-agent", args: [], timeoutMs: 30_000 },
      policy: routePolicy, snapshot: routeSnapshot, wallet: routePolicy.owner,
      portfolio: { balances: [], allowances: [], positions: [] },
      manifest: { version: 1, chainId: 196, deployments: [] },
    })).rejects.toThrow("safe workspace path");
    expect(agent.stopped).toBe(true);
  });

  it("rejects a symlinked artifact before parsing agent-controlled output", async () => {
    const agent = sandbox({
      "out/proposal.json": JSON.stringify(proposal),
      "out/evidence.json": JSON.stringify(evidence),
      "out/run-manifest.json": JSON.stringify({
        version: 1, commands: [], dependencies: [], sources: [], generatedFiles: [],
      }),
    });
    agent.readFile = async (path) => ({
      content: path === "out/proposal.json" ? JSON.stringify(proposal) : "{}",
      isSymbolicLink: path === "out/proposal.json",
    });
    await expect(runCodingAgentSandboxV1({
      sandbox: agent,
      command: { cmd: "cobia-agent", args: [], timeoutMs: 30_000 },
      policy: routePolicy, snapshot: routeSnapshot, wallet: routePolicy.owner,
      portfolio: { balances: [], allowances: [], positions: [] },
      manifest: { version: 1, chainId: 196, deployments: [] },
    })).rejects.toThrow("symbolic link");
    expect(agent.stopped).toBe(true);
  });

  it("stops an already-created sandbox when a command exceeds the resource limit", async () => {
    const agent = sandbox({});
    await expect(runCodingAgentSandboxV1({
      sandbox: agent,
      command: { cmd: "cobia-agent", args: [], timeoutMs: 300_001 },
      policy: routePolicy, snapshot: routeSnapshot, wallet: routePolicy.owner,
      portfolio: { balances: [], allowances: [], positions: [] },
      manifest: { version: 1, chainId: 196, deployments: [] },
    })).rejects.toThrow("timeout");
    expect(agent.stopped).toBe(true);
  });
});
