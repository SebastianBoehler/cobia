import {
  TransactionProgramV1Schema,
  commitment,
  type OpenIntentPolicyV3,
} from "@cobia/domain";
import type { SolverDecisionV1, SolverIntentV1 } from "@cobia/solver-sdk";
import { ProviderArtifactsV1Schema, TransactionProgramEvidenceV1Schema } from "@cobia/solvers";
import { keccak256, stringToHex, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import { captureOpenTransactionProgramSimulationsV1 } from
  "../../../apps/web/lib/open-exchange/transaction-fork-replay";
import { instrumentCommitmentV1, resolveInstrumentV1 } from
  "../../../apps/web/lib/instruments/production-registry";
import { startLocalFork } from "./local-fork";

type Input = OpenIntentPolicyV3["inputs"][number];
type Outcome = Extract<OpenIntentPolicyV3["outcomes"][number], { kind: "registered-instrument" }>;

const QuoteSchema = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  action: z.object({
    fromChainId: z.literal(1), toChainId: z.literal(1),
    fromToken: z.object({ address: z.string() }).passthrough(),
    toToken: z.object({ address: z.string() }).passthrough(),
    fromAmount: z.string(), fromAddress: z.string(), toAddress: z.string(),
  }).passthrough(),
  estimate: z.object({
    approvalAddress: z.string(), toAmountMin: z.string(),
  }).passthrough(),
  includedSteps: z.array(z.object({ tool: z.string().min(1) }).passthrough()).min(1),
  transactionRequest: z.object({
    from: z.string(), to: z.string(), chainId: z.literal(1),
    data: z.string().regex(/^0x[0-9a-fA-F]{8}[0-9a-fA-F]*$/),
    value: z.string().regex(/^0x[0-9a-fA-F]+$/),
  }).passthrough(),
}).passthrough();

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

async function quote(input: Input, outcome: Outcome, owner: Address) {
  const url = new URL("https://li.quest/v1/quote");
  const query = {
    fromChain: "1", toChain: "1", fromToken: input.token, toToken: outcome.token,
    fromAmount: input.maximumAtomic, fromAddress: owner, toAddress: owner, slippage: "0.005",
  };
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const raw = await response.text();
  if (!response.ok) throw new Error(`LI.FI quote returned HTTP ${response.status}`);
  const parsed = QuoteSchema.parse(JSON.parse(raw));
  if (parsed.action.fromChainId !== input.chainId || parsed.action.toChainId !== outcome.chainId ||
      !sameAddress(parsed.action.fromToken.address, input.token) ||
      !sameAddress(parsed.action.toToken.address, outcome.token) ||
      parsed.action.fromAmount !== input.maximumAtomic ||
      !sameAddress(parsed.action.fromAddress, owner) || !sameAddress(parsed.action.toAddress, owner) ||
      !sameAddress(parsed.transactionRequest.from, owner) ||
      BigInt(parsed.estimate.toAmountMin) < BigInt(outcome.minimumIncreaseAtomic)) {
    throw new Error("LI.FI quote does not satisfy the signed instrument outcome");
  }
  return { value: parsed, responseHash: keccak256(stringToHex(raw)), requestHash: commitment(query) as Hash };
}

export async function solveRegisteredInstrument(
  intent: SolverIntentV1,
  input: Input,
  outcome: Outcome,
): Promise<SolverDecisionV1> {
  if (input.chainId !== 1 || outcome.chainId !== 1) {
    return { version: 1, decision: "abstain", reasonCode: "RWA_CHAIN_UNSUPPORTED" };
  }
  try {
    const instrument = resolveInstrumentV1({ chainId: 1, token: outcome.token,
      jurisdiction: outcome.jurisdiction, nowSec: Math.floor(Date.now() / 1_000) });
    if (instrumentCommitmentV1(instrument) !== outcome.instrumentCommitment) {
      return { version: 1, decision: "abstain", reasonCode: "RWA_IDENTITY_CHANGED" };
    }
    const anchor = intent.snapshot.anchors.find(({ chainId }) => chainId === 1);
    if (!anchor) return { version: 1, decision: "abstain", reasonCode: "RWA_ANCHOR_MISSING" };
    const upstreamRpc = process.env.ETHEREUM_RPC_URL ?? "https://ethereum-rpc.publicnode.com";
    const observedAt = Math.floor(Date.now() / 1_000);
    const liveQuote = await quote(input, outcome, intent.policy.owner);
    const expiresAt = Math.min(intent.policy.deadline, observedAt + 120);
    const tools = [...new Set(liveQuote.value.includedSteps.map(({ tool }) => tool))].sort();
    const transaction = liveQuote.value.transactionRequest;
    const stage = {
      id: "01-acquire-rwa", kind: "wallet-transaction" as const, chainId: 1 as const,
      dependsOn: [], provider: "evm.raw@1" as const,
      quoteHash: liveQuote.requestHash, responseHash: liveQuote.responseHash,
      fetchedAt: observedAt, expiresAt,
      sender: intent.policy.owner, recipient: intent.policy.owner,
      input: { token: input.token, atomic: input.maximumAtomic },
      output: { chainId: 1 as const, token: outcome.token,
        minimumAtomic: outcome.minimumIncreaseAtomic },
      approval: { token: input.token,
        spender: liveQuote.value.estimate.approvalAddress.toLowerCase() as Address,
        maximumAtomic: input.maximumAtomic },
      transaction: {
        target: transaction.to.toLowerCase() as Address,
        selector: transaction.data.slice(0, 10).toLowerCase() as Hex,
        dataHash: keccak256(transaction.data as Hex),
        valueAtomic: BigInt(transaction.value).toString(),
      },
      tools,
    };
    const program = TransactionProgramV1Schema.parse({
      version: 1, programId: crypto.randomUUID(), requestId: intent.id,
      policyHash: intent.policyHash, owner: intent.policy.owner,
      createdAt: observedAt, deadline: expiresAt,
      maxEvidenceAgeSec: intent.policy.maxEvidenceAgeSec, stages: [stage],
    });
    const rawArtifact = { version: 1, provider: "evm.raw@1", stageId: stage.id,
      transaction: { chainId: 1, from: intent.policy.owner, to: stage.transaction.target,
        data: transaction.data.toLowerCase(), valueAtomic: stage.transaction.valueAtomic } };
    const providerArtifacts = ProviderArtifactsV1Schema.parse({ version: 1, artifacts: [{
      stageId: stage.id, provider: "evm.raw@1", payloadHash: commitment(rawArtifact), payload: rawArtifact,
    }] });
    const fork = await startLocalFork({ upstreamRpc, blockNumber: anchor.blockNumber,
      ...(process.env.ANVIL_PORT ? { port: Number(process.env.ANVIL_PORT) } : {}), chainId: 1 });
    let simulations;
    try {
      simulations = await captureOpenTransactionProgramSimulationsV1({
        program, providerArtifacts, snapshot: intent.snapshot, rpc: fork.rpc,
      });
    } finally { await fork.stop(); }
    const evidence = TransactionProgramEvidenceV1Schema.parse({
      version: 1, programHash: commitment(program), capturedAt: observedAt, simulations,
    });
    return { version: 1, decision: "submit", proposalKind: "transaction-program",
      program, evidence, providerArtifacts,
      provenance: { version: 1, runner: "cobia-reference-rwa-lifi@1",
        dependencies: [{ name: "anvil", version: "1.7.1" }],
        sources: instrument.officialSources.map(({ url, contentHash }) => ({ url, sha256: contentHash })),
        commandHashes: [], generatedFiles: [] } };
  } catch {
    return { version: 1, decision: "abstain", reasonCode: "NO_VERIFIED_RWA_ROUTE" };
  }
}
