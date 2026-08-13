import { commitment } from "@cobia/domain";
import { encodeFunctionData, erc20Abi, getAddress, isAddressEqual, type Address, type Hex } from "viem";
import { z } from "zod";

const AddressSchema = z.string().transform((value) => getAddress(value));
const AtomicSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const CallSchema = z.object({
  to: AddressSchema,
  data: z.string().regex(/^0x(?:[0-9a-fA-F]{2}){4,}$/).transform((value) => value as Hex),
  value: z.union([z.literal("0"), z.literal("0x0")]),
}).strict();
const ExecutionSchema = z.object({
  owner: AddressSchema,
  inputToken: AddressSchema,
  inputAmount: AtomicSchema.refine((value) => value !== "0"),
  deadline: AtomicSchema,
}).passthrough();
const AuthorizationSchema = z.object({ call: CallSchema }).passthrough();

interface ExecutionContext {
  state: string;
  owner: string;
  policy: { owner: string; deadline: number; maxSnapshotAgeSec: number };
  snapshot: { capturedAt: string };
  artifacts: readonly {
    kind: string;
    artifactHash: string;
    payload: unknown;
  }[];
}

function artifact(context: ExecutionContext, kind: string) {
  const value = context.artifacts.find((candidate) => candidate.kind === kind);
  if (!value) throw new Error(`Agent ${kind} artifact is unavailable`);
  return value;
}

export function prepareAgentExecutionV1(input: {
  context: ExecutionContext;
  owner: Address;
  executor: Address;
  nowSec: number;
  verifyArtifact?: (payload: unknown, declaredHash: string) => boolean;
}) {
  if (input.context.state !== "attested") throw new Error("Agent program is not attested");
  if (!isAddressEqual(input.context.owner as Address, input.owner) ||
    !isAddressEqual(input.context.policy.owner as Address, input.owner)) {
    throw new Error("Only the signed intent owner can execute this program");
  }
  const capturedAt = Math.floor(Date.parse(input.context.snapshot.capturedAt) / 1_000);
  if (!Number.isSafeInteger(capturedAt) || input.nowSec > capturedAt + input.context.policy.maxSnapshotAgeSec) {
    throw new Error("Agent program simulation evidence is stale");
  }
  if (input.nowSec >= input.context.policy.deadline) throw new Error("Agent program intent has expired");
  const executionArtifact = artifact(input.context, "execution");
  const authorizationArtifact = artifact(input.context, "authorization");
  const verify = input.verifyArtifact ?? ((payload, hash) => commitment(payload) === hash);
  if (!verify(executionArtifact.payload, executionArtifact.artifactHash) ||
    !verify(authorizationArtifact.payload, authorizationArtifact.artifactHash)) {
    throw new Error("Agent program artifact commitment is invalid");
  }
  const execution = ExecutionSchema.parse(executionArtifact.payload);
  const authorization = AuthorizationSchema.parse(authorizationArtifact.payload);
  if (!isAddressEqual(execution.owner, input.owner) ||
    !isAddressEqual(authorization.call.to, input.executor) ||
    authorization.call.value !== "0") {
    throw new Error("Agent execution artifact does not match its authority");
  }
  if (BigInt(execution.deadline) !== BigInt(input.context.policy.deadline)) {
    throw new Error("Agent execution deadline does not match the signed policy");
  }
  return {
    approval: {
      to: execution.inputToken,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [input.executor, BigInt(execution.inputAmount)],
      }),
      value: "0x0" as const,
    },
    execution: { ...authorization.call, value: "0x0" as const },
    inputAmountAtomic: execution.inputAmount,
  };
}
