import { commitment } from "@cobia/domain";
import {
  CapabilityProgramV1Schema,
  type CapabilityReplayResultV1,
  type CompiledCapabilityActionV1,
} from "@cobia/solvers";
import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddressEqual,
  isHash,
  toHex,
  type Address,
  type Hash,
} from "viem";

const FORK_GAS_BALANCE = "0x56bc75e2d63100000";

export interface CapabilityForkReplayReadV1 {
  getChainId(): Promise<number>;
  getBlock(number: bigint): Promise<{ hash?: Hash }>;
  getBalanceOf(token: Address, account: Address): Promise<bigint>;
  waitForReceipt(hash: Hash): Promise<{
    status: "success" | "reverted";
    transactionHash: Hash;
    logs: readonly { address: Address; data: `0x${string}`; topics: readonly Hash[] }[];
  }>;
  getCodeHash(address: Address): Promise<Hash>;
  getImplementation(address: Address): Promise<{
    address: Address;
    runtimeCodeHash: Hash;
  } | undefined>;
}

function uniqueAddresses(values: readonly Address[]): Address[] {
  return values.reduce<Address[]>((result, value) =>
    result.some((candidate) => isAddressEqual(candidate, value))
      ? result
      : [...result, getAddress(value)], []);
}

function refundTokens(
  program: ReturnType<typeof CapabilityProgramV1Schema.parse>,
  compiled: readonly CompiledCapabilityActionV1[],
) {
  return uniqueAddresses([
    program.input.token,
    ...compiled.flatMap(({ spend }) => spend.map(({ token }) => token)),
    ...compiled.flatMap(({ guaranteedOutputs }) => guaranteedOutputs.map(({ token }) => token)),
    ...program.constraints.map(({ token }) => token),
  ]);
}

function deployments(compiled: readonly CompiledCapabilityActionV1[]) {
  const unique = new Map<string, CompiledCapabilityActionV1["deployments"][number]>();
  for (const action of compiled) for (const deployment of action.deployments) {
    unique.set(deployment.address.toLowerCase(), deployment);
  }
  return [...unique.values()].sort((left, right) =>
    left.address.toLowerCase().localeCompare(right.address.toLowerCase()));
}

function transactionHash(value: unknown): Hash {
  if (typeof value !== "string" || !isHash(value)) throw new Error("Fork returned an invalid transaction hash");
  return value;
}

/** Replays verifier-compiled semantics on an isolated fork; this API cannot address production RPC. */
export async function replayCapabilityProgramOnForkV1(input: {
  program: unknown;
  compiled: readonly CompiledCapabilityActionV1[];
  forkRpc(method: string, params?: readonly unknown[]): Promise<unknown>;
  read: CapabilityForkReplayReadV1;
}): Promise<CapabilityReplayResultV1> {
  const program = CapabilityProgramV1Schema.parse(input.program);
  if (program.actions.length !== input.compiled.length) throw new Error("Fork replay compilation is incomplete");
  if (await input.read.getChainId() !== 196) throw new Error("Fork chain is not X Layer mainnet");
  const block = await input.read.getBlock(BigInt(program.pinnedBlock.number));
  if (!block.hash || block.hash.toLowerCase() !== program.pinnedBlock.hash.toLowerCase()) {
    throw new Error("Fork block does not match the pinned anchor");
  }
  const tokens = refundTokens(program, input.compiled);
  const constraintBefore = await Promise.all(program.constraints.map(({ token, account }) =>
    input.read.getBalanceOf(token, account)));
  const executorBefore = await Promise.all(tokens.map((token) =>
    input.read.getBalanceOf(token, program.executor)));
  const receipts: Awaited<ReturnType<CapabilityForkReplayReadV1["waitForReceipt"]>>[] = [];
  const send = async (from: Address, to: Address, data: `0x${string}`) => {
    const hash = transactionHash(await input.forkRpc("eth_sendTransaction", [{
      from, to, data, value: "0x0",
    }]));
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
      abi: erc20Abi,
      functionName: "transferFrom",
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
      for (const approval of action.spend) await send(
        program.executor,
        approval.token,
        encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [action.target, 0n] }),
      );
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
  const balanceDeltas = await Promise.all(program.constraints.map(async ({ token, account }, index) => ({
    token, account,
    beforeAtomic: constraintBefore[index]!.toString(),
    afterAtomic: (await input.read.getBalanceOf(token, account)).toString(),
  })));
  const observedDeployments = await Promise.all(deployments(input.compiled).map(async ({ address }) => {
    const implementation = await input.read.getImplementation(address);
    return {
      address: getAddress(address),
      runtimeCodeHash: await input.read.getCodeHash(address),
      ...(implementation ? { implementation } : {}),
    };
  }));
  const logs = receipts.flatMap(({ logs }) => logs.map(({ address, data, topics }) => ({
    address, data, topics: [...topics],
  })));
  return {
    reproduced: true,
    traceHash: commitment({
      actions: input.compiled.map(({ target, data }) => ({ target, data })),
      receipts: receipts.map(({ status, logs: receiptLogs }) => ({
        status,
        logs: receiptLogs.map(({ address, data, topics }) => ({ address, data, topics: [...topics] })),
      })),
    }),
    stateDiffHash: commitment(balanceDeltas),
    eventsHash: commitment(logs),
    balanceDeltas,
    deployments: observedDeployments,
  };
}
