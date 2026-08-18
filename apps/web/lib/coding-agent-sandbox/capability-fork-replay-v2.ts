import { commitment } from "@cobia/domain";
import {
  CapabilityProgramV2Schema,
  decodeStaticReadReturnV1,
  staticPredicateSatisfiedV1,
  type CapabilityProgramReplayResultV2,
  type CompiledCapabilityActionV1,
} from "@cobia/solvers";
import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddressEqual,
  isHash,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import type { CapabilityForkReplayReadV1 } from "./capability-fork-replay";

const FORK_GAS_BALANCE = "0x56bc75e2d63100000";

export interface CapabilityForkReplayReadV2 extends CapabilityForkReplayReadV1 {
  staticCall(input: { target: Address; data: Hex; gasLimit: number }): Promise<Hex>;
}

type Program = ReturnType<typeof CapabilityProgramV2Schema.parse>;
type Deployment = CompiledCapabilityActionV1["deployments"][number];

function uniqueAddresses(values: readonly Address[]): Address[] {
  return values.reduce<Address[]>((result, value) =>
    result.some((candidate) => isAddressEqual(candidate, value))
      ? result
      : [...result, getAddress(value)], []);
}

function refundTokens(program: Program, compiled: readonly CompiledCapabilityActionV1[]) {
  return uniqueAddresses([
    program.input.token,
    ...compiled.flatMap(({ spend }) => spend.map(({ token }) => token)),
    ...compiled.flatMap(({ guaranteedOutputs }) => guaranteedOutputs.map(({ token }) => token)),
    ...program.balanceConstraints.map(({ token }) => token),
  ]);
}

function sameDeployment(left: Deployment, right: Deployment) {
  return isAddressEqual(left.address, right.address) &&
    left.runtimeCodeHash === right.runtimeCodeHash &&
    (left.implementation === undefined
      ? right.implementation === undefined
      : right.implementation !== undefined &&
        isAddressEqual(left.implementation.address, right.implementation.address) &&
        left.implementation.runtimeCodeHash === right.implementation.runtimeCodeHash);
}

function mergeDeployment(left: Deployment, right: Deployment): Deployment {
  if (!isAddressEqual(left.address, right.address) || left.runtimeCodeHash !== right.runtimeCodeHash ||
    (left.implementation && right.implementation && !sameDeployment(left, right))) {
    throw new Error("Fork deployment identity conflict");
  }
  return left.implementation ? left : right;
}

function requiredDeployments(program: Program, compiled: readonly CompiledCapabilityActionV1[]) {
  const values: Deployment[] = [...compiled.flatMap(({ deployments }) => deployments)];
  const reads = [
    ...program.predicates,
    ...(program.objective.kind === "satisfy" ? [] : [program.objective.read]),
  ];
  values.push(...reads.map(({ target, runtimeCodeHash }) => ({ address: target, runtimeCodeHash })));
  const result = new Map<string, Deployment>();
  for (const value of values) {
    const key = value.address.toLowerCase();
    const current = result.get(key);
    result.set(key, current ? mergeDeployment(current, value) : value);
  }
  return [...result.values()].sort((left, right) =>
    left.address.toLowerCase().localeCompare(right.address.toLowerCase()));
}

function transactionHash(value: unknown): Hash {
  if (typeof value !== "string" || !isHash(value)) throw new Error("Fork returned an invalid transaction hash");
  return value;
}

/** Replays an accepted program only inside disposable Anvil; no production sender is reachable here. */
export async function replayCapabilityProgramOnForkV2(input: {
  program: unknown;
  compiled: readonly CompiledCapabilityActionV1[];
  forkRpc(method: string, params?: readonly unknown[]): Promise<unknown>;
  read: CapabilityForkReplayReadV2;
}): Promise<CapabilityProgramReplayResultV2> {
  const program = CapabilityProgramV2Schema.parse(input.program);
  if (program.actions.length !== input.compiled.length) throw new Error("Fork replay compilation is incomplete");
  if (await input.read.getChainId() !== 196) throw new Error("Fork chain is not X Layer mainnet");
  const block = await input.read.getBlock(BigInt(program.pinnedBlock.number));
  if (!block.hash || block.hash.toLowerCase() !== program.pinnedBlock.hash.toLowerCase()) {
    throw new Error("Fork block does not match the pinned anchor");
  }

  const expectedDeployments = requiredDeployments(program, input.compiled);
  const observedDeployments = await Promise.all(expectedDeployments.map(async (expected) => {
    const runtimeCodeHash = await input.read.getCodeHash(expected.address);
    if (runtimeCodeHash !== expected.runtimeCodeHash) throw new Error("Fork target code identity changed");
    const implementation = await input.read.getImplementation(expected.address);
    if ((expected.implementation === undefined) !== (implementation === undefined) ||
      (expected.implementation && implementation &&
        (!isAddressEqual(expected.implementation.address, implementation.address) ||
          expected.implementation.runtimeCodeHash !== implementation.runtimeCodeHash))) {
      throw new Error("Fork proxy implementation code identity changed");
    }
    return { address: getAddress(expected.address), runtimeCodeHash, ...(implementation ? { implementation } : {}) };
  }));

  const observe = async (read: Program["predicates"][number], phase: "before" | "after") => {
    if (await input.read.getCodeHash(read.target) !== read.runtimeCodeHash) {
      throw new Error("Fork static read code identity changed");
    }
    const returnData = await input.read.staticCall({ target: read.target, data: read.data, gasLimit: read.gasLimit });
    const decoded = decodeStaticReadReturnV1({
      target: read.target,
      runtimeCodeHash: read.runtimeCodeHash,
      data: read.data,
      returnWordIndex: read.returnWordIndex,
      decodeType: read.decodeType,
      gasLimit: read.gasLimit,
      label: read.label,
    }, returnData);
    return { ...decoded, phase, satisfied: staticPredicateSatisfiedV1(read, decoded.decodedValue) };
  };
  const observations = await Promise.all(program.predicates
    .filter(({ phase }) => phase === "before")
    .map((predicate) => observe(predicate, "before")));
  const tokens = refundTokens(program, input.compiled);
  const constraintBefore = await Promise.all(program.balanceConstraints.map(({ token }) =>
    input.read.getBalanceOf(token, program.owner)));
  const executorBefore = await Promise.all(tokens.map((token) =>
    input.read.getBalanceOf(token, program.executor)));
  const receipts: Awaited<ReturnType<CapabilityForkReplayReadV1["waitForReceipt"]>>[] = [];
  const send = async (from: Address, to: Address, data: Hex) => {
    const hash = transactionHash(await input.forkRpc("eth_sendTransaction", [{ from, to, data, value: "0x0" }]));
    const receipt = await input.read.waitForReceipt(hash);
    if (receipt.status !== "success") throw new Error("Fork capability transaction reverted");
    receipts.push(receipt);
  };

  await input.forkRpc("anvil_setBalance", [program.owner, FORK_GAS_BALANCE]);
  await input.forkRpc("anvil_setBalance", [program.executor, FORK_GAS_BALANCE]);
  await input.forkRpc("anvil_impersonateAccount", [program.owner]);
  await input.forkRpc("anvil_impersonateAccount", [program.executor]);
  try {
    await send(program.owner, program.input.token, encodeFunctionData({
      abi: erc20Abi, functionName: "approve", args: [program.executor, BigInt(program.input.atomic)],
    }));
    await send(program.executor, program.input.token, encodeFunctionData({
      abi: erc20Abi, functionName: "transferFrom",
      args: [program.owner, program.executor, BigInt(program.input.atomic)],
    }));
    for (const action of input.compiled) {
      for (const approval of action.spend) {
        await send(program.executor, approval.token, encodeFunctionData({
          abi: erc20Abi, functionName: "approve", args: [action.target, 0n],
        }));
        await send(program.executor, approval.token, encodeFunctionData({
          abi: erc20Abi, functionName: "approve", args: [action.target, BigInt(approval.atomic)],
        }));
      }
      await send(program.executor, action.target, action.data);
      for (const approval of action.spend) await send(program.executor, approval.token, encodeFunctionData({
        abi: erc20Abi, functionName: "approve", args: [action.target, 0n],
      }));
    }
    for (const [index, token] of tokens.entries()) {
      const balance = await input.read.getBalanceOf(token, program.executor);
      if (balance < executorBefore[index]!) throw new Error("Fork route consumed pre-existing executor funds");
      const amount = balance - executorBefore[index]!;
      if (amount > 0n) await send(program.executor, token, encodeFunctionData({
        abi: erc20Abi, functionName: "transfer", args: [program.owner, amount],
      }));
    }
  } finally {
    await input.forkRpc("anvil_stopImpersonatingAccount", [program.executor]);
    await input.forkRpc("anvil_stopImpersonatingAccount", [program.owner]);
  }

  observations.push(...await Promise.all(program.predicates
    .filter(({ phase }) => phase === "after")
    .map((predicate) => observe(predicate, "after"))));
  let objective: CapabilityProgramReplayResultV2["objective"];
  if (program.objective.kind !== "satisfy") {
    const read = program.objective.read;
    if (await input.read.getCodeHash(read.target) !== read.runtimeCodeHash) {
      throw new Error("Fork objective read code identity changed");
    }
    objective = decodeStaticReadReturnV1(read, await input.read.staticCall({
      target: read.target, data: read.data, gasLimit: read.gasLimit,
    }));
  }
  const balanceDeltas = await Promise.all(program.balanceConstraints.map(async ({ token }, index) => ({
    token, account: program.owner,
    beforeAtomic: constraintBefore[index]!.toString(),
    afterAtomic: (await input.read.getBalanceOf(token, program.owner)).toString(),
  })));
  const logs = receipts.flatMap(({ logs: receiptLogs }) => receiptLogs.map(({ address, data, topics }) => ({
    address, data, topics: [...topics],
  })));
  return {
    reproduced: true,
    traceHash: commitment({
      actions: input.compiled.map(({ target, data }) => ({ target, data })),
      receipts: receipts.map(({ status, logs: receiptLogs }) => ({
        status, logs: receiptLogs.map(({ address, data, topics }) => ({ address, data, topics: [...topics] })),
      })),
      observations,
      ...(objective ? { objective } : {}),
    }),
    stateDiffHash: commitment(balanceDeltas),
    eventsHash: commitment(logs),
    balanceDeltas,
    deployments: observedDeployments,
    observations,
    ...(objective ? { objective } : {}),
  };
}
