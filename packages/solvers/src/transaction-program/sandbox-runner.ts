import {
  OpenIntentPolicyV3Schema,
  OpenIntentSnapshotV1Schema,
  TransactionProgramV1Schema,
  commitment,
} from "@cobia/domain";
import { isAddressEqual, sha256 as sha256Hex, stringToHex, type Address } from "viem";
import { z } from "zod";
import type { CodingAgentSandboxV1 } from "../coding-agent-sandbox-runner";
import { TransactionProgramEvidenceV1Schema } from "./evidence";
import { ProviderArtifactsV1Schema } from "./provider-artifacts";

const DecisionSchema = z.discriminatedUnion("decision", [
  z.object({ version: z.literal(1), decision: z.literal("submit") }).strict(),
  z.object({ version: z.literal(1), decision: z.literal("abstain"),
    reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/) }).strict(),
]);
const RunManifestSchema = z.object({
  version: z.literal(1),
  dependencies: z.array(z.object({ name: z.string().min(1).max(128), version: z.string().min(1).max(128) }).strict()).max(256),
  sources: z.array(z.object({ url: z.string().url(), sha256: z.string().regex(/^0x[0-9a-f]{64}$/) }).strict()).max(128),
  generatedFiles: z.array(z.string().min(1).max(256)).max(128),
}).strict();
const ToolEndpointsSchema = z.object({
  readRpc: z.string().url().optional(),
  lifi: z.string().url().optional(),
  x402: z.string().url().optional(),
  sources: z.string().url().optional(),
}).strict();

function sha256(value: string) {
  return sha256Hex(stringToHex(value));
}

function safePath(path: string): boolean {
  return /^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(path) &&
    !path.split("/").includes("..");
}

async function readArtifact(sandbox: CodingAgentSandboxV1, path: string): Promise<string> {
  if (!safePath(path)) throw new Error("Sandbox artifact must use a safe workspace path");
  const file = await sandbox.readFile(path);
  if (file.isSymbolicLink) throw new Error("Sandbox artifact cannot be a symbolic link");
  return file.content;
}

function checkedEndpoint(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("Solver tool endpoint must be credential-free HTTPS");
  }
  return url.toString();
}

export async function runOpenTransactionProgramSandboxV1(input: {
  sandbox: CodingAgentSandboxV1;
  generate(sandbox: CodingAgentSandboxV1): Promise<{ responseIds: readonly string[]; commandCount: number }>;
  policy: unknown;
  snapshot: unknown;
  wallet: Address;
  portfolio: { balances: readonly unknown[]; allowances: readonly unknown[]; positions: readonly unknown[] };
  toolEndpoints: { readRpc?: string; lifi?: string; x402?: string; sources?: string };
}) {
  const commands: Array<{ cmd: string; args: readonly string[]; timeoutMs: number; exitCode: number;
    stdoutSha256: string; stderrSha256: string }> = [];
  const traced: CodingAgentSandboxV1 = {
    writeFile: (path, content) => input.sandbox.writeFile(path, content),
    readFile: (path) => input.sandbox.readFile(path),
    stop: () => input.sandbox.stop(),
    async run(command) {
      const result = await input.sandbox.run(command);
      commands.push({ ...command, args: [...command.args], exitCode: result.exitCode,
        stdoutSha256: sha256(result.stdout), stderrSha256: sha256(result.stderr) });
      return result;
    },
  };
  try {
    const policy = OpenIntentPolicyV3Schema.parse(input.policy);
    const snapshot = OpenIntentSnapshotV1Schema.parse(input.snapshot);
    if (!isAddressEqual(policy.owner, input.wallet) || snapshot.requestId !== policy.requestId ||
        commitment(snapshot.anchors.map(({ chainId }) => chainId)) !== commitment(policy.executionChainIds)) {
      throw new Error("Open sandbox request does not match policy authority");
    }
    const endpoints = ToolEndpointsSchema.parse(input.toolEndpoints);
    const tools = Object.fromEntries(Object.entries(endpoints).map(([key, value]) => [
      key, { mode: "brokered-read-only", endpoint: checkedEndpoint(value) },
    ]));
    await traced.writeFile("in/task.json", JSON.stringify({
      version: 3, kind: "open-onchain", policy, wallet: input.wallet,
      portfolio: input.portfolio, anchors: snapshot.anchors,
      tokenEvidence: snapshot.tokenEvidence ?? [], tools,
      outputs: ["out/decision.json", "out/program.json", "out/evidence.json",
        "out/provider-artifacts.json", "out/run-manifest.json"],
    }));
    const generation = await input.generate(traced);
    if (generation.commandCount !== commands.length) throw new Error("Coding-agent command provenance is incomplete");
    const decision = DecisionSchema.parse(JSON.parse(await readArtifact(traced, "out/decision.json")));
    if (decision.decision === "abstain") return null;
    const program = TransactionProgramV1Schema.parse(JSON.parse(await readArtifact(traced, "out/program.json")));
    const walletStages = program.stages.filter((stage) => stage.kind === "wallet-transaction");
    if (program.requestId !== policy.requestId || program.policyHash !== commitment(policy) ||
        !isAddressEqual(program.owner, policy.owner) || program.stages.length > policy.limits.maxStages ||
        walletStages.length < (policy.limits.minimumStages ?? 1) ||
        program.stages.some(({ chainId }) => !policy.executionChainIds.includes(chainId))) {
      throw new Error("Transaction program does not match open policy authority");
    }
    const evidence = TransactionProgramEvidenceV1Schema.parse(JSON.parse(
      await readArtifact(traced, "out/evidence.json"),
    ));
    if (evidence.programHash !== commitment(program)) throw new Error("Transaction program evidence hash mismatch");
    const providerArtifacts = ProviderArtifactsV1Schema.parse(JSON.parse(
      await readArtifact(traced, "out/provider-artifacts.json"),
    )).artifacts;
    if (providerArtifacts.length !== walletStages.length || walletStages.some((stage) => {
      const artifact = providerArtifacts.find(({ stageId }) => stageId === stage.id);
      return !artifact || artifact.provider !== stage.provider;
    })) throw new Error("Provider artifacts do not match wallet stages");
    const manifest = RunManifestSchema.parse(JSON.parse(await readArtifact(traced, "out/run-manifest.json")));
    const generatedFiles = await Promise.all(manifest.generatedFiles.map(async (path) => ({
      path, sha256: sha256(await readArtifact(traced, path)),
    })));
    return { program, evidence, providerArtifacts, provenance: { modelResponseIds: [...generation.responseIds], commands,
      dependencies: manifest.dependencies, sources: manifest.sources, generatedFiles } };
  } finally {
    await input.sandbox.stop();
  }
}
