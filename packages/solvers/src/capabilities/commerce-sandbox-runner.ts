import {
  CommerceOfferV1Schema,
  CommerceOrderPolicyV1Schema,
  commerceOfferCommitmentV1,
} from "@cobia/domain";
import { isAddressEqual, sha256 as sha256Hex, stringToHex, type Address, type Hash } from "viem";
import { z } from "zod";
import type { CodingAgentSandboxV1 } from "../coding-agent-sandbox-runner";
import { CommerceProgramEvidenceV1Schema } from "./commerce-evidence";
import { CommerceOrderProgramV1Schema } from "./commerce-order";

const RunManifestV1Schema = z.object({
  version: z.literal(1),
  dependencies: z.array(z.object({
    name: z.string().min(1).max(128), version: z.string().min(1).max(128),
  }).strict()).max(256),
  sources: z.array(z.object({
    url: z.string().url(), sha256: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
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

const sensitiveKeys = new Set([
  "apikey", "authorization", "cookie", "mnemonic", "password", "privatekey",
  "rpcurl", "secret", "seed", "signer", "walletclient",
]);

export interface CommerceSandboxProvenanceV1 {
  modelResponseIds: readonly string[];
  dependencies: readonly { name: string; version: string }[];
  sources: readonly { url: string; sha256: string }[];
  commands: readonly {
    cmd: string; args: readonly string[]; timeoutMs: number; exitCode: number;
    stdoutSha256: Hash; stderrSha256: Hash;
  }[];
  generatedFiles: readonly { path: string; sha256: Hash }[];
}

function sha256(value: string): Hash {
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

function assertPublicInput(value: unknown, key = "root"): void {
  if (sensitiveKeys.has(key.replace(/[^a-z]/gi, "").toLowerCase())) {
    throw new Error(`Sandbox input contains forbidden credential field: ${key}`);
  }
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    const url = new URL(value);
    const sensitiveQuery = [...url.searchParams.keys()].some((name) =>
      sensitiveKeys.has(name.replace(/[^a-z]/gi, "").toLowerCase()));
    if (url.username || url.password || sensitiveQuery) {
      throw new Error("Sandbox input contains a credential-bearing URL");
    }
  }
  if (Array.isArray(value)) {
    value.forEach((item) => assertPublicInput(item, key));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, child]) => assertPublicInput(child, childKey));
  }
}

export async function runCommerceSandboxV1(input: {
  sandbox: CodingAgentSandboxV1;
  generate(sandbox: CodingAgentSandboxV1): Promise<{
    responseIds: readonly string[]; commandCount: number;
  }>;
  policy: unknown;
  offer: unknown;
  wallet: Address;
  portfolio: { balances: readonly unknown[]; allowances: readonly unknown[]; positions: readonly unknown[] };
  manifest: unknown;
  executor: Address;
  block: { number: string; hash: Hash };
}) {
  const commands: CommerceSandboxProvenanceV1["commands"][number][] = [];
  const traced: CodingAgentSandboxV1 = {
    writeFile: (path, content) => input.sandbox.writeFile(path, content),
    readFile: (path) => input.sandbox.readFile(path),
    stop: () => input.sandbox.stop(),
    async run(command) {
      const result = await input.sandbox.run(command);
      commands.push({
        ...command, args: [...command.args], exitCode: result.exitCode,
        stdoutSha256: sha256(result.stdout), stderrSha256: sha256(result.stderr),
      });
      return result;
    },
  };
  try {
    const policy = CommerceOrderPolicyV1Schema.parse(input.policy);
    const offer = CommerceOfferV1Schema.parse(input.offer);
    if (!isAddressEqual(policy.owner, input.wallet)) throw new Error("Sandbox wallet must match policy owner");
    if (policy.offerCommitment !== commerceOfferCommitmentV1(offer)) {
      throw new Error("Sandbox offer does not match policy commitment");
    }
    if (offer.eligibility.status !== "executable") throw new Error("Sandbox offer is not executable");
    const task = {
      version: 1, kind: "commerce-order", policy, offer, wallet: input.wallet,
      executor: input.executor, portfolio: input.portfolio, registry: input.manifest,
      block: input.block, rpc: { mode: "brokered-read-only", chainId: 196 },
      outputs: ["out/decision.json", "out/program.json", "out/evidence.json", "out/run-manifest.json"],
    } as const;
    assertPublicInput(task);
    await traced.writeFile("in/task.json", JSON.stringify(task));
    const generation = await input.generate(traced);
    if (generation.commandCount !== commands.length) {
      throw new Error("Coding-agent command provenance is incomplete");
    }
    const decision = DecisionV1Schema.parse(JSON.parse(await readArtifact(traced, "out/decision.json")));
    if (decision.decision === "abstain") return null;
    const program = CommerceOrderProgramV1Schema.parse(JSON.parse(await readArtifact(traced, "out/program.json")));
    const evidence = CommerceProgramEvidenceV1Schema.parse(JSON.parse(await readArtifact(traced, "out/evidence.json")));
    const manifest = RunManifestV1Schema.parse(JSON.parse(await readArtifact(traced, "out/run-manifest.json")));
    const generatedFiles = await Promise.all(manifest.generatedFiles.map(async (path) => ({
      path, sha256: sha256(await readArtifact(traced, path)),
    })));
    return {
      program, evidence,
      provenance: {
        modelResponseIds: [...generation.responseIds], dependencies: manifest.dependencies,
        sources: manifest.sources, commands, generatedFiles,
      } satisfies CommerceSandboxProvenanceV1,
    };
  } finally {
    await input.sandbox.stop();
  }
}
