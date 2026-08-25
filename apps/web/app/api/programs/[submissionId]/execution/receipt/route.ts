import {
  CapabilityCompositionPolicyV1Schema, commitment, OpenIntentPolicyV3Schema,
} from "@cobia/domain";
import { CapabilityProgramV2Schema, TransactionProgramEvidenceV1Schema } from "@cobia/solvers";
import { NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http, isAddressEqual, type Hash, type Hex } from "viem";
import { base, mainnet } from "viem/chains";
import { z } from "zod";
import { xLayer } from "../../../../../../lib/chain/xlayer";
import { prepareAgentExecutionV3 } from "../../../../../../lib/coding-agent-sandbox/agent-execution-v3";
import { readConfirmedBalanceChanges } from "../../../../../../lib/coding-agent-sandbox/confirmed-balance-changes";
import { verifyAgentExecutionAccessProof } from "../../../../../../lib/coding-agent-sandbox/execution-access";
import {
  assertCanonicalAgentExecutionReceipt, validateAgentExecutionReceiptV3,
} from "../../../../../../lib/coding-agent-sandbox/execution-receipt-v3";
import { readCodingAgentV3ExecutionConfig } from "../../../../../../lib/env";
import { deriveCapabilityAuthorityV2 } from "../../../../../../lib/open-exchange/capability-authority";
import { deriveCompositionAuthorityV1 } from "../../../../../../lib/open-exchange/composition-authority";
import { verifyOpenWalletBatchReceiptsV1 } from "../../../../../../lib/open-exchange/wallet-batch-receipt";
import { finalizeSolverSuccessFee } from "../../../../../../lib/payments/launch-solver-success-fee";
import {
  getSolverSubmissionRepository, getSolverSuccessFeeRepository,
} from "../../../../../../lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AccessSchema = z.object({
  proof: z.unknown(),
  ownerSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});
const BodySchema = z.union([AccessSchema.extend({
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
}).strict(), AccessSchema.extend({
  transactionHashes: z.array(z.string().regex(/^0x[0-9a-fA-F]{64}$/)).min(1).max(32),
}).strict()]);

export async function POST(
  request: Request,
  context: RouteContext<"/api/programs/[submissionId]/execution/receipt">,
) {
  const { submissionId } = await context.params;
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({
      code: "INVALID_REQUEST", message: "Execution receipt is invalid.",
    }, { status: 400 });
  }
  try {
    const nowSec = Math.floor(Date.now() / 1_000);
    const proof = await verifyAgentExecutionAccessProof({
      proof: body.proof, signature: body.ownerSignature as Hex, nowSec,
    });
    if (proof.programId !== submissionId || proof.realm !== new URL(request.url).host) {
      return NextResponse.json({
        code: "INVALID_PROOF", message: "Receipt proof does not match this program.",
      }, { status: 403 });
    }
    const repository = getSolverSubmissionRepository();
    const stored = await repository.getExecutionContext(submissionId);
    if (!stored || !isAddressEqual(stored.owner as `0x${string}`, proof.owner)) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Owner program not found." }, { status: 404 });
    }
    const config = readCodingAgentV3ExecutionConfig();
    const executionArtifact = stored.artifacts.find(({ kind }) => kind === "execution");
    const walletChainId = "transactionHashes" in body
      ? z.object({ stages: z.array(z.object({ chainId: z.union([
        z.literal(1), z.literal(196), z.literal(8453),
      ]) }).passthrough()).min(1) }).passthrough().parse(executionArtifact?.payload).stages[0]!.chainId
      : 196;
    const chain = walletChainId === 1 ? mainnet : walletChainId === 8453 ? base : xLayer;
    const rpcUrl = walletChainId === 1 ? config.ETHEREUM_RPC_URL
      : walletChainId === 8453 ? config.BASE_RPC_URL : config.XLAYER_RPC_URL;
    const client = createPublicClient({
      chain, transport: http(rpcUrl, { timeout: 15_000 }), cacheTime: 0,
    });
    const latestBlock = await client.getBlock();
    if (latestBlock.number === null) {
      throw new Error("Execution receipt block metadata is unavailable");
    }
    let attributed: unknown;
    let attributedBlockNumber: bigint | undefined;
    if ("transactionHashes" in body) {
      const execution = executionArtifact;
      if (!execution || commitment(execution.payload) !== execution.artifactHash) {
        throw new Error("Open execution artifact is unavailable");
      }
      const batchReceipt = await verifyOpenWalletBatchReceiptsV1({
        batch: execution.payload, owner: proof.owner, transactionHashes: body.transactionHashes,
        latestBlockNumber: latestBlock.number,
        readTransaction: (hash) => client.getTransaction({ hash }),
        readReceipt: (hash) => client.getTransactionReceipt({ hash }),
        readCanonicalBlock: (number) => client.getBlock({ blockNumber: number }),
      });
      attributed = batchReceipt;
      attributedBlockNumber = BigInt(batchReceipt.receipts.at(-1)!.blockNumber);
      const policy = OpenIntentPolicyV3Schema.parse(stored.policy);
      const evidenceArtifact = stored.artifacts.find(({ kind }) => kind === "evidence");
      const evidence = TransactionProgramEvidenceV1Schema.parse(evidenceArtifact?.payload);
      for (const outcome of policy.outcomes) {
        if (outcome.kind !== "minimum-final" && outcome.kind !== "minimum-increase" &&
            outcome.kind !== "registered-instrument") continue;
        const baseline = evidence.simulations.flatMap(({ assetDeltas }) => assetDeltas)
          .find(({ token, account }) => isAddressEqual(token, outcome.token) && isAddressEqual(account, proof.owner));
        if (!baseline) throw new Error("Open execution outcome baseline is unavailable");
        const balance = await client.readContract({ address: outcome.token, abi: erc20Abi,
          functionName: "balanceOf", args: [proof.owner], blockNumber: latestBlock.number });
        const required = outcome.kind === "minimum-final" ? BigInt(outcome.atomic)
          : BigInt(baseline.beforeAtomic) + BigInt(outcome.kind === "registered-instrument"
            ? outcome.minimumIncreaseAtomic : outcome.atomic);
        if (balance < required) throw new Error("Confirmed execution did not satisfy the signed outcome");
      }
    } else {
      const transactionHash = body.transactionHash as Hash;
      const [transaction, receipt] = await Promise.all([
        client.getTransaction({ hash: transactionHash }),
        client.getTransactionReceipt({ hash: transactionHash }),
      ]);
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      if (block.number === null) throw new Error("Execution receipt block metadata is unavailable");
      assertCanonicalAgentExecutionReceipt({ receipt,
        canonicalBlock: { number: block.number, hash: block.hash }, latestBlockNumber: latestBlock.number });
      const authority = stored.policy.kind === "capability-composition"
        ? (() => {
          const policy = CapabilityCompositionPolicyV1Schema.parse(stored.policy);
          const programArtifact = stored.artifacts.find(({ kind }) => kind === "program");
          if (!programArtifact) throw new Error("Verified composition program is unavailable");
          const program = CapabilityProgramV2Schema.parse(programArtifact.payload);
          return deriveCompositionAuthorityV1(policy, stored.snapshot, {
            inputAtomic: program.input.atomic,
            actions: program.actions,
            balanceConstraints: program.balanceConstraints,
          });
        })()
        : deriveCapabilityAuthorityV2(stored.policy, stored.snapshot);
      const prepared = prepareAgentExecutionV3({
        context: { ...stored, policy: authority.policy, snapshot: authority.snapshot,
          policyHash: commitment(authority.policy), snapshotHash: commitment(authority.snapshot),
          manifestHash: authority.policy.manifestHash },
        owner: proof.owner, executor: config.COBIA_EXECUTOR_V3_ADDRESS, nowSec: Number(block.timestamp),
      });
      attributed = validateAgentExecutionReceiptV3({
      expected: {
        owner: proof.owner,
        executor: config.COBIA_EXECUTOR_V3_ADDRESS,
        data: prepared.execution.data,
        canonicalProgramHash: prepared.canonicalProgramHash,
        executionCommitment: prepared.executionCommitment,
      },
      transaction: {
        hash: transaction.hash, from: transaction.from, to: transaction.to,
        input: transaction.input, value: transaction.value,
      },
      receipt: {
        transactionHash: receipt.transactionHash, status: receipt.status,
        blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, logs: receipt.logs,
      },
      });
      attributedBlockNumber = receipt.blockNumber;
    }
    if (attributedBlockNumber !== undefined) {
      const evidence = stored.artifacts.find(({ kind }) => kind === "evidence")?.payload;
      const balanceChanges = await readConfirmedBalanceChanges({
        evidence,
        owner: proof.owner,
        blockNumber: attributedBlockNumber,
        readBalance: (token, owner, blockNumber) => client.readContract({
          address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], blockNumber,
        }),
        readNativeBalance: (owner, blockNumber) => client.getBalance({ address: owner, blockNumber }),
      });
      if (balanceChanges.length > 0) attributed = { ...(attributed as object), balanceChanges };
    }
    await repository.appendArtifact(submissionId, "receipt", attributed);
    await repository.resolve(submissionId, "executed", []);
    const successFee = await finalizeSolverSuccessFee({ submissionId,
      repository: getSolverSuccessFeeRepository(), nowSec: Math.floor(Date.now() / 1_000) });
    return NextResponse.json({ state: "confirmed", receipt: attributed, successFee });
  } catch {
    return NextResponse.json({
      code: "RECEIPT_UNAVAILABLE", message: "Could not attribute execution receipt.",
    }, { status: 409 });
  }
}
