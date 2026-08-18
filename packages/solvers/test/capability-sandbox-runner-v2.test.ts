import { describe, expect, it, vi } from "vitest";
import { runCapabilitySandboxV2, type CodingAgentSandboxV1 } from "../src";
import {
  evidence, executor, manifestHash, owner, policy, program, snapshot,
} from "./capability-v2-fixtures";

function sandbox(files: Record<string, string>, symlink = "") {
  const writes: Record<string, string> = {};
  const value: CodingAgentSandboxV1 & { writes: typeof writes; stopped: boolean } = {
    writes,
    stopped: false,
    async writeFile(path, content) { writes[path] = content; },
    async run(command) {
      if (command.timeoutMs === 1) throw new Error("sandbox command timed out");
      return { exitCode: 0, stdout: command.args.join(" "), stderr: "" };
    },
    async readFile(path) {
      const content = files[path];
      if (!content) throw new Error(`missing ${path}`);
      return { content, isSymbolicLink: path === symlink };
    },
    async stop() { value.stopped = true; },
  };
  return value;
}

function files(generatedFiles = ["out/search.mjs"]) {
  return {
    "out/program.json": JSON.stringify(program()),
    "out/evidence.json": JSON.stringify(evidence()),
    "out/run-manifest.json": JSON.stringify({
      version: 1,
      dependencies: [{ name: "viem", version: "2.55.11" }],
      sources: [{ url: "https://example.com/abi.json", sha256: `0x${"ab".repeat(32)}` }],
      generatedFiles,
    }),
    "out/search.mjs": "console.log('route')",
  };
}

function run(agent: ReturnType<typeof sandbox>, generate = async (environment: CodingAgentSandboxV1) => {
  await environment.run({ cmd: "node", args: ["out/search.mjs"], timeoutMs: 30_000 });
  return { responseIds: ["resp_1"], commandCount: 1 };
}) {
  return runCapabilitySandboxV2({
    sandbox: agent,
    generate,
    policy,
    snapshot,
    wallet: owner,
    portfolio: { balances: [], allowances: [], positions: [] },
    manifest: { manifestHash },
    executor,
  });
}

describe("general capability sandbox runner", () => {
  it("exposes address-only public state and captures immutable provenance", async () => {
    const agent = sandbox(files());
    const result = await run(agent);
    const task = agent.writes["in/task.json"]!;
    expect(task).not.toMatch(/private.?key|seed|OPENAI|XLAYER_RPC_URL/i);
    expect(JSON.parse(task)).toMatchObject({
      version: 2, kind: "general-onchain", wallet: owner, executor,
      rpc: { mode: "brokered-read-only", chainId: 196 },
      block: { number: snapshot.blockNumber, hash: snapshot.blockHash },
    });
    expect(result.provenance).toMatchObject({ modelResponseIds: ["resp_1"] });
    expect(result.provenance.commands).toHaveLength(1);
    expect(agent.stopped).toBe(true);
  });

  it.each([
    [["../secret"], "", "safe workspace path"],
    [["out/search.mjs"], "out/search.mjs", "symbolic link"],
  ] as const)("rejects unsafe artifact output", async (generated, symlink, message) => {
    const agent = sandbox(files([...generated]), symlink);
    await expect(run(agent)).rejects.toThrow(message);
    expect(agent.stopped).toBe(true);
  });

  it("propagates timeouts and rejects incomplete command provenance", async () => {
    const timed = sandbox(files());
    await expect(run(timed, async (environment) => {
      await environment.run({ cmd: "node", args: [], timeoutMs: 1 });
      return { responseIds: [], commandCount: 1 };
    })).rejects.toThrow("timed out");
    expect(timed.stopped).toBe(true);

    const incomplete = sandbox(files());
    await expect(run(incomplete, async () => ({ responseIds: [], commandCount: 1 })))
      .rejects.toThrow("command provenance is incomplete");
    expect(incomplete.stopped).toBe(true);
  });

  it("hashes fetched and generated inputs instead of trusting display metadata", async () => {
    const first = sandbox(files());
    const secondFiles = files();
    secondFiles["out/search.mjs"] = "console.log('changed')";
    const second = sandbox(secondFiles);
    const [left, right] = await Promise.all([run(first), run(second)]);
    expect(left.provenance.generatedFiles[0]?.sha256)
      .not.toBe(right.provenance.generatedFiles[0]?.sha256);
  });
});
