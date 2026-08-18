import { commitment } from "@cobia/domain";
import { encodeFunctionData, erc20Abi, getAddress, isAddressEqual, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import { encodeAtomicExecutionCallV3 } from "../atomic-execution/encode-v3";
import {
  assertAtomicExecutionProgramV3,
  type AtomicAuthorizationV3,
  type AtomicExecutionProgramV3,
} from "../atomic-execution/types-v3";

const AddressSchema = z.string().transform((value) => getAddress(value));
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value.toLowerCase() as Hash);
const HexSchema = z.string().regex(/^0x(?:[0-9a-fA-F]{2})+$/).transform((value) => value as Hex);
const UintSchema = z.string().regex(/^(0|[1-9][0-9]*)$/).transform(BigInt);
const PositiveUintSchema = UintSchema.refine((value) => value > 0n);

const ApprovalSchema = z.object({ token: AddressSchema, amount: PositiveUintSchema }).strict();
const ActionSchema = z.object({
  capabilityKey: HashSchema,
  target: AddressSchema,
  approvals: z.array(ApprovalSchema),
  data: HexSchema,
}).strict();
const ConstraintSchema = z.object({
  token: AddressSchema,
  kind: z.union([z.literal(0), z.literal(1)]),
  minimum: PositiveUintSchema,
}).strict();
const ReadSchema = z.object({
  target: AddressSchema,
  runtimeCodeHash: HashSchema,
  data: HexSchema,
  returnWordIndex: z.number().int().nonnegative(),
  decodeType: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  gasLimit: z.number().int().positive(),
}).strict();
const PredicateSchema = z.object({
  read: ReadSchema,
  phase: z.union([z.literal(0), z.literal(1)]),
  comparator: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  bound: HashSchema,
}).strict();
const ProgramSchema = z.object({
  policyHash: HashSchema,
  manifestHash: HashSchema,
  canonicalProgramHash: HashSchema,
  simulationHash: HashSchema,
  pinnedBlockNumber: PositiveUintSchema,
  pinnedBlockHash: HashSchema,
  owner: AddressSchema,
  inputToken: AddressSchema,
  inputAmount: PositiveUintSchema,
  deadline: PositiveUintSchema,
  nonce: HashSchema,
  refundTokens: z.array(AddressSchema),
  actions: z.array(ActionSchema),
  constraints: z.array(ConstraintSchema),
  predicates: z.array(PredicateSchema),
}).strict();
const AuthorizationSchema = z.object({
  executor: AddressSchema,
  chainId: PositiveUintSchema,
  executionCommitment: HashSchema,
  policyHash: HashSchema,
  manifestHash: HashSchema,
  canonicalProgramHash: HashSchema,
  simulationHash: HashSchema,
  pinnedBlockNumber: PositiveUintSchema,
  pinnedBlockHash: HashSchema,
  owner: AddressSchema,
  inputToken: AddressSchema,
  inputAmount: PositiveUintSchema,
  deadline: PositiveUintSchema,
  nonce: HashSchema,
}).strict();
const CallSchema = z.object({
  to: AddressSchema,
  data: HexSchema,
  value: z.union([z.literal("0"), z.literal("0x0")]),
}).strict();
const ExecutionArtifactSchema = z.object({ version: z.literal(3), program: ProgramSchema }).strict();
const AttestationArtifactSchema = z.object({
  version: z.literal(3),
  authorization: AuthorizationSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform((value) => value as Hex),
  call: CallSchema,
}).passthrough();

interface ExecutionContextV3 {
  state: string;
  owner: string;
  policyHash: string;
  snapshotHash: string;
  manifestHash: string;
  blockNumber: string;
  blockHash: string;
  policy: {
    owner: string;
    deadline: number;
    maxEvidenceAgeSec: number;
    manifestHash: string;
    nonce: string;
    input: { token: string; maxAtomic: string };
  };
  snapshot: { capturedAt: string; blockNumber: string; blockHash: string };
  artifacts: readonly { kind: string; artifactHash: string; payload: unknown }[];
}

function artifact(context: ExecutionContextV3, kind: string) {
  const result = context.artifacts.find((candidate) => candidate.kind === kind);
  if (!result) throw new Error(`Agent ${kind} artifact is unavailable`);
  if (commitment(result.payload) !== result.artifactHash) {
    throw new Error(`Agent ${kind} artifact commitment is invalid`);
  }
  return result.payload;
}

export function exactApprovalCalls(input: {
  token: Address;
  executor: Address;
  allowance: bigint;
  required: bigint;
}) {
  if (input.allowance < 0n || input.required <= 0n) {
    throw new Error("Exact approval amounts are invalid");
  }
  if (input.allowance === input.required) return [];
  const approve = (amount: bigint) => ({
    to: input.token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [input.executor, amount],
    }),
    value: "0x0" as const,
  });
  return [...(input.allowance > 0n ? [approve(0n)] : []), approve(input.required)];
}

export function prepareAgentExecutionV3(input: {
  context: ExecutionContextV3;
  owner: Address;
  executor: Address;
  nowSec: number;
}) {
  if (input.context.state !== "attested") throw new Error("General agent program is not attested");
  if (!isAddressEqual(input.context.owner as Address, input.owner) ||
    !isAddressEqual(input.context.policy.owner as Address, input.owner)) {
    throw new Error("Only the signed general-intent owner can execute this program");
  }
  const capturedAt = Math.floor(Date.parse(input.context.snapshot.capturedAt) / 1_000);
  if (!Number.isSafeInteger(capturedAt) ||
    input.nowSec > capturedAt + input.context.policy.maxEvidenceAgeSec) {
    throw new Error("General program simulation evidence is stale");
  }
  if (input.nowSec >= input.context.policy.deadline) throw new Error("General intent has expired");
  if (commitment(input.context.policy) !== input.context.policyHash ||
    commitment(input.context.snapshot) !== input.context.snapshotHash) {
    throw new Error("General execution request context commitment is invalid");
  }

  const execution = ExecutionArtifactSchema.parse(artifact(input.context, "execution"));
  const attestation = AttestationArtifactSchema.parse(artifact(input.context, "authorization"));
  const program = execution.program as AtomicExecutionProgramV3;
  const authorization = attestation.authorization as AtomicAuthorizationV3;
  assertAtomicExecutionProgramV3(program);
  if (!isAddressEqual(program.owner, input.owner) ||
    !isAddressEqual(program.inputToken, input.context.policy.input.token as Address) ||
    program.inputAmount > BigInt(input.context.policy.input.maxAtomic) ||
    program.deadline !== BigInt(input.context.policy.deadline) ||
    program.policyHash !== input.context.policyHash ||
    program.manifestHash !== input.context.manifestHash ||
    program.manifestHash !== input.context.policy.manifestHash ||
    program.nonce !== input.context.policy.nonce ||
    program.pinnedBlockNumber !== BigInt(input.context.blockNumber) ||
    program.pinnedBlockNumber !== BigInt(input.context.snapshot.blockNumber) ||
    program.pinnedBlockHash !== input.context.blockHash ||
    program.pinnedBlockHash !== input.context.snapshot.blockHash) {
    throw new Error("General execution does not match the signed policy authority");
  }
  const expectedCall = encodeAtomicExecutionCallV3({
    program,
    authorization,
    expectedExecutor: input.executor,
    signature: attestation.signature,
  });
  if (!isAddressEqual(attestation.call.to, expectedCall.to) ||
    attestation.call.data.toLowerCase() !== expectedCall.data.toLowerCase() ||
    (attestation.call.value !== "0" && attestation.call.value !== "0x0")) {
    throw new Error("General execution call does not match its verifier attestation");
  }
  return {
    approval: {
      to: program.inputToken,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [input.executor, program.inputAmount],
      }),
      value: "0x0" as const,
    },
    execution: { ...expectedCall, value: "0x0" as const },
    inputAmountAtomic: program.inputAmount.toString(),
    canonicalProgramHash: program.canonicalProgramHash,
    executionCommitment: authorization.executionCommitment,
  };
}
