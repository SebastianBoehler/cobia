import {
  RouteSnapshotV2Schema,
  StablecoinPolicyV2Schema,
} from "@cobia/domain";
import { isAddressEqual, sha256 as sha256Hex, stringToHex } from "viem";
import { z } from "zod";
import {
  CodingAgentProposalV1Schema,
  CodingAgentSimulationEvidenceV1Schema,
  type CodingAgentProposalV1,
  type CodingAgentSimulationEvidenceV1,
} from "./coding-agent-proposal";

const RunManifestSchema = z.object({
  version: z.literal(1),
  commands: z.array(z.string().min(1).max(1_024)).max(128),
  dependencies: z.array(z.object({ name: z.string().min(1), version: z.string().min(1) }).strict()).max(256),
  sources: z.array(z.object({ url: z.string().url(), sha256: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).strict()).max(128),
  generatedFiles: z.array(z.string().min(1).max(256)).max(128),
}).strict();

export interface CodingAgentSandboxV1 {
  writeFile(path: string, content: string): Promise<void>;
  run(command: { cmd: string; args: readonly string[]; timeoutMs: number }): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
  readFile(path: string): Promise<{ content: string; isSymbolicLink: boolean }>;
  stop(): Promise<void>;
}

export interface CodingAgentSandboxRunInputV1 {
  sandbox: CodingAgentSandboxV1;
  command: { cmd: string; args: readonly string[]; timeoutMs: number };
  policy: unknown;
  snapshot: unknown;
  wallet: `0x${string}`;
  portfolio: {
    balances: readonly unknown[];
    allowances: readonly unknown[];
    positions: readonly unknown[];
  };
  manifest: unknown;
}

export interface CodingAgentProvenanceV1 {
  command: { cmd: string; args: readonly string[]; exitCode: number; stdoutSha256: string; stderrSha256: string };
  dependencies: readonly { name: string; version: string }[];
  sources: readonly { url: string; sha256: string }[];
  commands: readonly string[];
  generatedFiles: readonly { path: string; sha256: string }[];
}

function sha256(value: string) {
  return sha256Hex(stringToHex(value));
}

function safePath(path: string): boolean {
  return /^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(path) &&
    !path.split("/").includes("..");
}

async function readSandboxFile(sandbox: CodingAgentSandboxV1, path: string): Promise<string> {
  if (!safePath(path)) throw new Error("Sandbox artifact must use a safe workspace path");
  const file = await sandbox.readFile(path);
  if (file.isSymbolicLink) throw new Error("Sandbox artifact cannot be a symbolic link");
  return file.content;
}

/**
 * Runs an untrusted coding agent in an already-isolated sandbox. Its result is
 * deliberately only a proposal plus provenance: callers must use the verifier
 * and a fresh fork replay before any wallet execution path can consume it.
 */
export async function runCodingAgentSandboxV1(input: CodingAgentSandboxRunInputV1): Promise<{
  proposal: CodingAgentProposalV1;
  evidence: CodingAgentSimulationEvidenceV1;
  provenance: CodingAgentProvenanceV1;
}> {
  try {
    const policy = StablecoinPolicyV2Schema.parse(input.policy);
    const snapshot = RouteSnapshotV2Schema.parse(input.snapshot);
    if (!isAddressEqual(policy.owner, input.wallet)) throw new Error("Sandbox wallet must match policy owner");
    if (input.command.timeoutMs < 1 || input.command.timeoutMs > 300_000) {
      throw new Error("Sandbox command timeout is outside the allowed limit");
    }
    const task = JSON.stringify({
      version: 1,
      policy,
      wallet: input.wallet,
      portfolio: input.portfolio,
      registry: input.manifest,
      block: { number: snapshot.blockNumber, hash: snapshot.blockHash },
      rpc: { mode: "brokered-read-only", chainId: 196 },
    });
    await input.sandbox.writeFile("in/task.json", task);
    const command = await input.sandbox.run(input.command);
    if (command.exitCode !== 0) throw new Error("Coding agent command failed");
    const proposal = CodingAgentProposalV1Schema.parse(JSON.parse(
      await readSandboxFile(input.sandbox, "out/proposal.json"),
    ));
    const evidence = CodingAgentSimulationEvidenceV1Schema.parse(JSON.parse(
      await readSandboxFile(input.sandbox, "out/evidence.json"),
    ));
    const runManifest = RunManifestSchema.parse(JSON.parse(
      await readSandboxFile(input.sandbox, "out/run-manifest.json"),
    ));
    const generatedFiles = await Promise.all(runManifest.generatedFiles.map(async (path) => ({
      path,
      sha256: sha256(await readSandboxFile(input.sandbox, path)),
    })));
    return {
      proposal,
      evidence,
      provenance: {
        command: { ...input.command, exitCode: command.exitCode, stdoutSha256: sha256(command.stdout), stderrSha256: sha256(command.stderr) },
        commands: runManifest.commands,
        dependencies: runManifest.dependencies,
        sources: runManifest.sources,
        generatedFiles,
      },
    };
  } finally {
    await input.sandbox.stop();
  }
}
