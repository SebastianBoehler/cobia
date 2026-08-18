import {
  CommerceOfferV1Schema,
  CommerceOrderPolicyV1Schema,
  commerceOfferCommitmentV1,
  commerceOrderPolicyCommitmentV1,
} from "@cobia/domain";
import { describe, expect, it } from "vitest";
import {
  type CodingAgentSandboxV1,
  CommerceOrderProgramV1Schema,
  CommerceProgramEvidenceV1Schema,
  runCommerceSandboxV1,
} from "../src";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111";
const payee = "0x2222222222222222222222222222222222222222";
const asset = "0x3333333333333333333333333333333333333333";
const executor = "0x4444444444444444444444444444444444444444";
const nowSec = 2_000_000_000;
const offer = CommerceOfferV1Schema.parse({
  version: 1, offerId: "x402:example:resource", expiresAt: nowSec + 300,
  source: {
    protocol: "x402-v2", url: "https://bazaar.example/resources", adapterVersion: 1,
    fetchedAt: nowSec, responseHash: hash("1"), provenance: ["resource:https://api.example/resource"],
  },
  merchant: { id: "api.example", displayName: "API", payee, manifestHash: hash("2") },
  product: { id: "resource", commitment: hash("3"), descriptionHash: hash("4"), quantity: "1", mediaHashes: [] },
  payment: { chainId: 196, scheme: "exact", asset, atomicAmount: "10000", maxTimeoutSec: 60 },
  placement: { kind: "x402-exact", endpoint: "https://api.example/resource" },
  evidence: { profile: "payment-settled", receiptRecipient: owner },
  eligibility: { status: "executable" },
});
const policy = CommerceOrderPolicyV1Schema.parse({
  version: 1, kind: "commerce-order", requestId: "550e8400-e29b-41d4-a716-446655440066",
  displayGoal: "Buy API resource", owner, receiptRecipient: owner, executionChainId: 196,
  nonce: hash("5"), createdAt: nowSec, deadline: nowSec + 300,
  competition: { closesAt: nowSec + 120, maxRevisionsPerSolver: 3 }, maxEvidenceAgeSec: 120,
  offerCommitment: commerceOfferCommitmentV1(offer), merchantManifestHash: hash("2"),
  payment: { asset, maxAtomic: "10000" }, evidenceProfile: "payment-settled",
  allowedCapabilities: [{ id: "commerce.order.place", version: 1 }],
  limits: { maxActions: 1, maxApprovals: 0, maxActionCalldataBytes: 4096, maxExpectedGas: 500_000 },
  forbiddenTargets: [], forbiddenAssets: [],
});
const program = CommerceOrderProgramV1Schema.parse({
  version: 1, kind: "commerce-order", requestId: policy.requestId, chainId: 196,
  policyHash: commerceOrderPolicyCommitmentV1(policy), manifestHash: policy.merchantManifestHash,
  owner, executor, pinnedBlock: { number: "123456", hash: hash("7") },
  deadline: policy.deadline, nonce: policy.nonce,
  capability: { id: "commerce.order.place", version: 1 },
  parameters: {
    offerCommitment: policy.offerCommitment, quantity: "1", orderCommitment: hash("8"),
    evidenceProfile: "payment-settled",
  },
});
const evidence = CommerceProgramEvidenceV1Schema.parse({
  version: 1, chainId: 196, blockNumber: "123456", blockHash: hash("7"), capturedAtSec: nowSec + 30,
  programHash: hash("9"), compiledActionHash: hash("a"), traceHash: hash("b"),
  stateDiffHash: hash("c"), receiptCommitment: hash("d"),
});

function sandbox(files: Record<string, string>, symlink = "") {
  const writes: Record<string, string> = {};
  const value: CodingAgentSandboxV1 & { writes: typeof writes; stopped: boolean } = {
    writes, stopped: false,
    async writeFile(path, content) { writes[path] = content; },
    async run(command) { return { exitCode: 0, stdout: command.cmd, stderr: "" }; },
    async readFile(path) {
      const content = files[path];
      if (!content) throw new Error(`missing ${path}`);
      return { content, isSymbolicLink: path === symlink };
    },
    async stop() { value.stopped = true; },
  };
  return value;
}

function artifacts(decision: "submit" | "abstain" = "submit"): Record<string, string> {
  return decision === "abstain" ? {
    "out/decision.json": JSON.stringify({ version: 1, decision, reasonCode: "NO_VERIFIABLE_ORDER" }),
  } : {
    "out/decision.json": JSON.stringify({ version: 1, decision }),
    "out/program.json": JSON.stringify(program),
    "out/evidence.json": JSON.stringify(evidence),
    "out/run-manifest.json": JSON.stringify({
      version: 1, dependencies: [{ name: "viem", version: "2.55.11" }],
      sources: [{ url: "https://api.example/docs", sha256: hash("e") }],
      generatedFiles: ["out/search.ts"],
    }),
    "out/search.ts": "export const candidate = 'bounded';",
  };
}

function run(agent: ReturnType<typeof sandbox>) {
  return runCommerceSandboxV1({
    sandbox: agent,
    generate: async (environment) => {
      await environment.run({ cmd: "node", args: ["out/search.js"], timeoutMs: 30_000 });
      return { responseIds: ["resp_1"], commandCount: 1 };
    },
    policy, offer, wallet: owner, portfolio: { balances: [], allowances: [], positions: [] },
    manifest: { version: 1, chainId: 196, entries: [] }, executor,
    block: { number: "123456", hash: hash("7") },
  });
}

describe("commerce coding-agent sandbox", () => {
  it("exposes only canonical public inputs and returns typed untrusted artifacts", async () => {
    const agent = sandbox(artifacts());
    const result = await run(agent);
    const task = agent.writes["in/task.json"]!;
    expect(task).not.toMatch(/private.?key|seed|signTypedData|sendTransaction|XLAYER_RPC_URL/i);
    expect(JSON.parse(task)).toMatchObject({
      kind: "commerce-order", wallet: owner, executor,
      rpc: { mode: "brokered-read-only", chainId: 196 }, offer,
    });
    expect(result).toMatchObject({ program, evidence, provenance: { modelResponseIds: ["resp_1"] } });
    expect(agent.stopped).toBe(true);
  });

  it("permits abstention and rejects symlink or incomplete command provenance", async () => {
    await expect(run(sandbox(artifacts("abstain")))).resolves.toBeNull();
    await expect(run(sandbox(artifacts(), "out/search.ts"))).rejects.toThrow("symbolic link");
    const agent = sandbox(artifacts());
    await expect(runCommerceSandboxV1({
      sandbox: agent, generate: async () => ({ responseIds: [], commandCount: 1 }),
      policy, offer, wallet: owner, portfolio: { balances: [], allowances: [], positions: [] },
      manifest: {}, executor, block: { number: "123456", hash: hash("7") },
    })).rejects.toThrow("command provenance is incomplete");
  });

  it("rejects credential-bearing registry inputs and mismatched offers", async () => {
    const agent = sandbox(artifacts());
    await expect(runCommerceSandboxV1({
      sandbox: agent, generate: async () => ({ responseIds: [], commandCount: 0 }),
      policy, offer, wallet: owner, portfolio: { balances: [], allowances: [], positions: [] },
      manifest: { rpcUrl: "https://rpc.example/?api_key=secret" }, executor,
      block: { number: "123456", hash: hash("7") },
    })).rejects.toThrow("forbidden credential field");
    await expect(runCommerceSandboxV1({
      sandbox: sandbox(artifacts()), generate: async () => ({ responseIds: [], commandCount: 0 }),
      policy, offer: { ...offer, offerId: "x402:example:other" }, wallet: owner,
      portfolio: { balances: [], allowances: [], positions: [] }, manifest: {}, executor,
      block: { number: "123456", hash: hash("7") },
    })).rejects.toThrow("does not match policy commitment");
  });
});
