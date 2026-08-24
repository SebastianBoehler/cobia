import { readFileSync, writeFileSync } from "node:fs";
import { getAddress, isAddress, type Address, type Hash, type Hex } from "viem";
import {
  buildAgentExecutorDeploymentPlanV4,
  safeProposalTransactionsV4,
} from "../lib/deployment/agent-executor-v4-plan";
import { buildSafeBatch } from "../lib/deployment/safe-batch";
import type { PartitionedMigrationBudgetInputV4 } from "../lib/deployment/v4-migration-budget";
import {
  addressArgument,
  argument,
  executorArtifactsV4,
  optionalArgument,
} from "./executor-deployment-input";

interface AdapterFile {
  adapterId: Hash;
  target: Address;
  selector: Hex;
  runtimeCodeHash: Hash;
}
const HASH = /^0x[0-9a-f]{64}$/;
const SELECTOR = /^0x[0-9a-f]{8}$/;

function emit(value: unknown) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const output = optionalArgument("output");
  if (output) writeFileSync(output, serialized, { mode: 0o600 });
  else process.stdout.write(serialized);
}

function adapters(path: string): AdapterFile[] {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(value)) throw new Error("Adapter input must be an array");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Adapter input is malformed");
    const item = entry as Record<string, unknown>;
    if (typeof item.adapterId !== "string" || !HASH.test(item.adapterId) ||
        typeof item.target !== "string" || !isAddress(item.target) ||
        typeof item.selector !== "string" || !SELECTOR.test(item.selector) ||
        typeof item.runtimeCodeHash !== "string" || !HASH.test(item.runtimeCodeHash)) {
      throw new Error("Adapter input is malformed");
    }
    return { adapterId: item.adapterId as Hash, target: getAddress(item.target),
      selector: item.selector as Hex, runtimeCodeHash: item.runtimeCodeHash as Hash };
  });
}

function migration(path: string, chainId: 1 | 196): PartitionedMigrationBudgetInputV4 {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!value || typeof value !== "object") throw new Error("Migration input is malformed");
  const item = value as Record<string, unknown>;
  if (item.chainId !== chainId || typeof item.combinedProtocolBudgetUsdE8 !== "string" ||
      typeof item.v4ProtocolCapUsdE8 !== "string" || !Array.isArray(item.v3Assets)) {
    throw new Error("Migration input is malformed");
  }
  const v3Assets = item.v3Assets.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Migration asset is malformed");
    const asset = entry as Record<string, unknown>;
    if (asset.chainId !== chainId || typeof asset.token !== "string" || !isAddress(asset.token) ||
        typeof asset.decimals !== "number" || typeof asset.fixedUsdE8PerToken !== "string" ||
        typeof asset.maximumRemainingAtomic !== "string") throw new Error("Migration asset is malformed");
    return { chainId, token: getAddress(asset.token).toLowerCase() as Address,
      decimals: asset.decimals, fixedUsdE8PerToken: asset.fixedUsdE8PerToken,
      maximumRemainingAtomic: asset.maximumRemainingAtomic };
  });
  return { chainId, combinedProtocolBudgetUsdE8: item.combinedProtocolBudgetUsdE8,
    v4ProtocolCapUsdE8: item.v4ProtocolCapUsdE8, v3Assets };
}

const chainId = Number(argument("chain-id"));
if (chainId !== 1 && chainId !== 196) throw new Error("--chain-id must be 1 or 196");
const changeDelaySeconds = Number(optionalArgument("change-delay-seconds") ?? 48 * 60 * 60);
const retainProtocolCap = process.argv.includes("--retain-protocol-cap");
const plan = buildAgentExecutorDeploymentPlanV4({
  chainId,
  deployer: addressArgument("deployer"),
  deployerNonce: BigInt(argument("nonce")),
  owner: addressArgument("owner"),
  verifier: addressArgument("verifier"),
  canaryWallet: addressArgument("canary-wallet"),
  registry: addressArgument("registry"),
  artifacts: executorArtifactsV4(),
  adapters: adapters(argument("adapters")),
  migration: migration(argument("migration"), chainId),
  changeDelaySeconds,
  retainProtocolCap,
});
const format = optionalArgument("format") ?? "plan";
if (format === "plan") {
  emit(plan);
} else if (format === "safe-batches") {
  const createdAt = Number(argument("created-at"));
  const immediate = plan.activationDelaySeconds === 0;
  const batch = (name: string, description: string, transactions: readonly {
    to: Address; value: Hex; data: Hex;
  }[]) => buildSafeBatch({ chainId, safe: plan.owner, name, description, createdAt, transactions });
  emit({
    proposal: batch(
      `Cobia Executor V4 chain ${chainId} ${immediate ? "immediate canary" : "proposal"}` +
        `${retainProtocolCap ? " - retain protocol cap" : ""}`,
      immediate
        ? "Retains the deployed contract limits and immediately activates only the canary wallet."
        : retainProtocolCap
          ? "Retains the deployed contract limits and starts the reviewed governance delays."
          : "Applies the reviewed migration cap and starts the reviewed governance delays.",
      safeProposalTransactionsV4(plan, { retainProtocolCap }),
    ),
    ...(!immediate ? { activation: batch(
      `Cobia Executor V4 chain ${chainId} activation`,
      plan.adapters.length === 0
        ? "Activates the matured canary-wallet and unpause proposals after independent re-verification."
        : "Activates the matured plugin, canary-wallet, and unpause proposals after independent re-verification.",
      plan.activationTransactions,
    ) } : {}),
    openProposal: batch(
      `Cobia Executor V4 chain ${chainId} ${immediate ? "immediate public access" : "open-access proposal"}`,
      immediate
        ? "Immediately activates public access after a successful canary."
        : "Starts the separate public open-access delay after canary verification.",
      plan.publicLaunchTransactions,
    ),
    ...(!immediate ? { openActivation: batch(
      `Cobia Executor V4 chain ${chainId} open-access activation`,
      "Activates public open access after the separate delay and independent re-verification.",
      [plan.openActivationTransaction],
    ) } : {}),
  });
} else {
  throw new Error(`Unsupported --format ${format}`);
}
