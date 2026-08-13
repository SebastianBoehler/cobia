import { RouteSnapshotV2Schema, StablecoinPolicyV2Schema } from "@cobia/domain";
import { isAddressEqual, sha256 as sha256Hex, stringToHex, type Address } from "viem";
import { z } from "zod";
import { CapabilityProgramEvidenceV1Schema } from "../coding-agent-proposal";
import type { CodingAgentSandboxV1 } from "../coding-agent-sandbox-runner";
import { CapabilityProgramV1Schema } from "./program";

const ManifestSchema = z.object({
  version: z.literal(1),
  dependencies: z.array(z.object({
    name: z.string().min(1).max(128),
    version: z.string().min(1).max(128),
  }).strict()).max(256),
  sources: z.array(z.object({
    url: z.string().url(),
    sha256: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  }).strict()).max(128),
  generatedFiles: z.array(z.string().min(1).max(256)).max(128),
}).strict();

export interface CapabilitySandboxGenerationV1 {
  responseIds: readonly string[];
  commandCount: number;
}

export interface CapabilitySandboxProvenanceV1 {
  modelResponseIds: readonly string[];
  dependencies: readonly { name: string; version: string }[];
  sources: readonly { url: string; sha256: string }[];
  commands: readonly {
    cmd: string;
    args: readonly string[];
    timeoutMs: number;
    exitCode: number;
    stdoutSha256: string;
    stderrSha256: string;
  }[];
  generatedFiles: readonly { path: string; sha256: string }[];
}

function sha256(value: string) {
  return sha256Hex(stringToHex(value));
}

function safePath(path: string): boolean {
  return /^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(path) &&
    !path.split("/").includes("..");
}

async function readFile(sandbox: CodingAgentSandboxV1, path: string): Promise<string> {
  if (!safePath(path)) throw new Error("Sandbox artifact must use a safe workspace path");
  const file = await sandbox.readFile(path);
  if (file.isSymbolicLink) throw new Error("Sandbox artifact cannot be a symbolic link");
  return file.content;
}

export async function runCapabilitySandboxV1(input: {
  sandbox: CodingAgentSandboxV1;
  generate(sandbox: CodingAgentSandboxV1): Promise<CapabilitySandboxGenerationV1>;
  policy: unknown;
  snapshot: unknown;
  wallet: Address;
  portfolio: { balances: readonly unknown[]; allowances: readonly unknown[]; positions: readonly unknown[] };
  manifest: unknown;
  executor: Address;
}) {
  const commands: CapabilitySandboxProvenanceV1["commands"][number][] = [];
  const traced: CodingAgentSandboxV1 = {
    writeFile: (path, content) => input.sandbox.writeFile(path, content),
    readFile: (path) => input.sandbox.readFile(path),
    stop: () => input.sandbox.stop(),
    async run(command) {
      const result = await input.sandbox.run(command);
      commands.push({
        ...command,
        args: [...command.args],
        exitCode: result.exitCode,
        stdoutSha256: sha256(result.stdout),
        stderrSha256: sha256(result.stderr),
      });
      return result;
    },
  };
  try {
    const policy = StablecoinPolicyV2Schema.parse(input.policy);
    const snapshot = RouteSnapshotV2Schema.parse(input.snapshot);
    if (!isAddressEqual(policy.owner, input.wallet)) {
      throw new Error("Sandbox wallet must match policy owner");
    }
    await traced.writeFile("in/task.json", JSON.stringify({
      version: 1,
      policy,
      wallet: input.wallet,
      executor: input.executor,
      portfolio: input.portfolio,
      registry: input.manifest,
      block: { number: snapshot.blockNumber, hash: snapshot.blockHash },
      rpc: { mode: "brokered-read-only", chainId: 196 },
      outputs: ["out/program.json", "out/evidence.json", "out/run-manifest.json"],
    }));
    const generation = await input.generate(traced);
    if (generation.commandCount !== commands.length) {
      throw new Error("Coding-agent command provenance is incomplete");
    }
    const program = CapabilityProgramV1Schema.parse(JSON.parse(
      await readFile(traced, "out/program.json"),
    ));
    const evidence = CapabilityProgramEvidenceV1Schema.parse(JSON.parse(
      await readFile(traced, "out/evidence.json"),
    ));
    const manifest = ManifestSchema.parse(JSON.parse(
      await readFile(traced, "out/run-manifest.json"),
    ));
    const generatedFiles = await Promise.all(manifest.generatedFiles.map(async (path) => ({
      path,
      sha256: sha256(await readFile(traced, path)),
    })));
    return {
      program,
      evidence,
      provenance: {
        modelResponseIds: [...generation.responseIds],
        dependencies: manifest.dependencies,
        sources: manifest.sources,
        commands,
        generatedFiles,
      } satisfies CapabilitySandboxProvenanceV1,
    };
  } finally {
    await input.sandbox.stop();
  }
}
