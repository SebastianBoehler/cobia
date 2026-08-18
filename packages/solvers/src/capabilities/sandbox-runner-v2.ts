import {
  GeneralIntentPolicyV2Schema,
  GeneralIntentSnapshotV1Schema,
} from "@cobia/domain";
import { isAddressEqual, sha256 as sha256Hex, stringToHex, type Address } from "viem";
import { z } from "zod";
import type { CodingAgentSandboxV1 } from "../coding-agent-sandbox-runner";
import {
  CapabilityProgramEvidenceV2Schema,
} from "./evidence-v2";
import { CapabilityProgramV2Schema } from "./program-v2";

const RunManifestV1Schema = z.object({
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

const DecisionV1Schema = z.discriminatedUnion("decision", [
  z.object({ version: z.literal(1), decision: z.literal("submit") }).strict(),
  z.object({
    version: z.literal(1), decision: z.literal("abstain"),
    reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
  }).strict(),
]);

export interface CapabilitySandboxGenerationV2 {
  responseIds: readonly string[];
  commandCount: number;
}

export interface CapabilitySandboxProvenanceV2 {
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

function safeWorkspacePath(path: string): boolean {
  return /^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(path) &&
    !path.split("/").includes("..");
}

async function readArtifact(sandbox: CodingAgentSandboxV1, path: string): Promise<string> {
  if (!safeWorkspacePath(path)) throw new Error("Sandbox artifact must use a safe workspace path");
  const file = await sandbox.readFile(path);
  if (file.isSymbolicLink) throw new Error("Sandbox artifact cannot be a symbolic link");
  return file.content;
}

export async function runCapabilitySandboxV2(input: {
  sandbox: CodingAgentSandboxV1;
  generate(sandbox: CodingAgentSandboxV1): Promise<CapabilitySandboxGenerationV2>;
  policy: unknown;
  snapshot: unknown;
  wallet: Address;
  portfolio: { balances: readonly unknown[]; allowances: readonly unknown[]; positions: readonly unknown[] };
  manifest: unknown;
  executor: Address;
}) {
  const commands: CapabilitySandboxProvenanceV2["commands"][number][] = [];
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
    const policy = GeneralIntentPolicyV2Schema.parse(input.policy);
    const snapshot = GeneralIntentSnapshotV1Schema.parse(input.snapshot);
    if (!isAddressEqual(policy.owner, input.wallet)) {
      throw new Error("Sandbox wallet must match policy owner");
    }
    await traced.writeFile("in/task.json", JSON.stringify({
      version: 2,
      kind: "general-onchain",
      policy,
      wallet: input.wallet,
      executor: input.executor,
      portfolio: input.portfolio,
      registry: input.manifest,
      block: { number: snapshot.blockNumber, hash: snapshot.blockHash },
      rpc: { mode: "brokered-read-only", chainId: 196 },
      outputs: [
        "out/decision.json",
        "out/program.json (required only when decision is submit)",
        "out/evidence.json (required only when decision is submit)",
        "out/run-manifest.json (required only when decision is submit)",
      ],
    }));
    const generation = await input.generate(traced);
    if (generation.commandCount !== commands.length) {
      throw new Error("Coding-agent command provenance is incomplete");
    }
    const decision = DecisionV1Schema.parse(JSON.parse(
      await readArtifact(traced, "out/decision.json"),
    ));
    if (decision.decision === "abstain") return null;
    const program = CapabilityProgramV2Schema.parse(JSON.parse(
      await readArtifact(traced, "out/program.json"),
    ));
    const evidence = CapabilityProgramEvidenceV2Schema.parse(JSON.parse(
      await readArtifact(traced, "out/evidence.json"),
    ));
    const manifest = RunManifestV1Schema.parse(JSON.parse(
      await readArtifact(traced, "out/run-manifest.json"),
    ));
    const generatedFiles = await Promise.all(manifest.generatedFiles.map(async (path) => ({
      path,
      sha256: sha256(await readArtifact(traced, path)),
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
      } satisfies CapabilitySandboxProvenanceV2,
    };
  } finally {
    await input.sandbox.stop();
  }
}
