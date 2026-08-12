import { commitment } from "@cobia/domain";
import {
  isAddressEqual,
  isHash,
  toHex,
  type Address,
  type Hash,
} from "viem";
import {
  CodingAgentProposalV1Schema,
  type CodingAgentProposalV1,
} from "@cobia/solvers";

const FORK_GAS_BALANCE = "0x56bc75e2d63100000";

export interface CodingAgentForkReadV1 {
  getChainId(): Promise<number>;
  getBlock(blockNumber: bigint): Promise<{ hash?: Hash }>;
  waitForReceipt(hash: Hash): Promise<{
    status: "success" | "reverted";
    transactionHash: Hash;
    blockHash: Hash;
    blockNumber: bigint;
    logs: readonly { address: Address; data: `0x${string}`; topics: readonly Hash[] }[];
  }>;
  getBalanceOf(asset: Address, owner: Address): Promise<bigint>;
  getCodeHash(address: Address): Promise<Hash>;
  getImplementation(address: Address): Promise<{ address: Address; runtimeCodeHash: Hash } | undefined>;
}

export interface CodingAgentForkReplayV1 {
  reproduced: true;
  traceHash: Hash;
  stateDiffHash: Hash;
  finalBalances: readonly { asset: Address; owner: Address; atomic: string }[];
  deployments: readonly {
    address: Address;
    runtimeCodeHash: Hash;
    implementation?: { address: Address; runtimeCodeHash: Hash };
  }[];
}

function transactionHash(value: unknown): Hash {
  if (typeof value !== "string" || !isHash(value)) throw new Error("Fork returned an invalid transaction hash");
  return value;
}

function uniqueAddresses(calls: CodingAgentProposalV1["calls"]): Address[] {
  return calls.reduce<Address[]>((addresses, { to }) =>
    addresses.some((address) => isAddressEqual(address, to)) ? addresses : [...addresses, to], []);
}

/** Executes the exact unsigned proposal only through a disposable Anvil fork. */
export async function replayCodingAgentProposalOnForkV1(input: {
  proposal: unknown;
  anchor: { number: string; hash: Hash };
  rpc(method: string, params?: readonly unknown[]): Promise<unknown>;
  read: CodingAgentForkReadV1;
}): Promise<CodingAgentForkReplayV1> {
  const proposal = CodingAgentProposalV1Schema.parse(input.proposal);
  if (await input.read.getChainId() !== 196) throw new Error("Fork chain ID does not match X Layer mainnet");
  const block = await input.read.getBlock(BigInt(input.anchor.number));
  if (!block.hash || block.hash.toLowerCase() !== input.anchor.hash.toLowerCase()) {
    throw new Error("Fork block hash does not match the pinned anchor");
  }
  await input.rpc("anvil_setBalance", [proposal.owner, FORK_GAS_BALANCE]);
  await input.rpc("anvil_impersonateAccount", [proposal.owner]);
  const receipts = [] as Awaited<ReturnType<CodingAgentForkReadV1["waitForReceipt"]>>[];
  try {
    for (const call of proposal.calls) {
      const hash = transactionHash(await input.rpc("eth_sendTransaction", [{
        from: proposal.owner,
        to: call.to,
        data: call.data,
        value: toHex(BigInt(call.valueAtomic)),
      }]));
      const receipt = await input.read.waitForReceipt(hash);
      if (receipt.status !== "success") throw new Error("Fork transaction reverted");
      receipts.push(receipt);
    }
  } finally {
    await input.rpc("anvil_stopImpersonatingAccount", [proposal.owner]);
  }
  const finalBalances = await Promise.all(proposal.minimumFinalBalances.map(async (balance) => ({
    ...balance,
    atomic: (await input.read.getBalanceOf(balance.asset, balance.owner)).toString(),
  })));
  const deployments = await Promise.all(uniqueAddresses(proposal.calls).map(async (address) => {
    const implementation = await input.read.getImplementation(address);
    return implementation
      ? { address, runtimeCodeHash: await input.read.getCodeHash(address), implementation }
      : { address, runtimeCodeHash: await input.read.getCodeHash(address) };
  }));
  const traceHash = commitment({
    anchor: input.anchor,
    receipts: receipts.map((receipt) => ({
      transactionHash: receipt.transactionHash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber.toString(),
      logs: receipt.logs.map(({ address, data, topics }) => ({ address, data, topics })),
    })),
  });
  const stateDiffHash = commitment({ finalBalances, deployments });
  return { reproduced: true, traceHash, stateDiffHash, finalBalances, deployments };
}
