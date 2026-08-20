import {
  encodeFunctionData,
  erc20Abi,
  isAddressEqual,
  isHash,
  type Address,
  type Hash,
} from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import type { CapabilityForkReplayReadV1 } from "./capability-fork-replay";

const FORK_GAS_BALANCE = "0x56bc75e2d63100000";

function fundingSource(token: Address): Address {
  const asset = Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find(({ underlying }) =>
    isAddressEqual(underlying.address, token));
  if (!asset) throw new Error("Fork cannot seed an unregistered input asset");
  return asset.aToken.address;
}

function transactionHash(value: unknown): Hash {
  if (typeof value !== "string" || !isHash(value)) {
    throw new Error("Fork returned an invalid funding transaction hash");
  }
  return value;
}

/** Adds only missing signed principal inside disposable Anvil state. */
export async function seedCapabilityForkPrincipalV1(input: {
  owner: Address;
  token: Address;
  amountAtomic: bigint;
  forkRpc(method: string, params?: readonly unknown[]): Promise<unknown>;
  read: Pick<CapabilityForkReplayReadV1, "getBalanceOf" | "waitForReceipt">;
}) {
  const current = await input.read.getBalanceOf(input.token, input.owner);
  if (current >= input.amountAtomic) return;
  const missing = input.amountAtomic - current;
  const source = fundingSource(input.token);
  if (await input.read.getBalanceOf(input.token, source) < missing) {
    throw new Error("Fork funding source cannot cover the signed principal");
  }

  await input.forkRpc("anvil_setBalance", [source, FORK_GAS_BALANCE]);
  await input.forkRpc("anvil_impersonateAccount", [source]);
  try {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [input.owner, missing],
    });
    const hash = transactionHash(await input.forkRpc("eth_sendTransaction", [{
      from: source,
      to: input.token,
      data,
      value: "0x0",
    }]));
    if ((await input.read.waitForReceipt(hash)).status !== "success") {
      throw new Error("Fork principal funding reverted");
    }
  } finally {
    await input.forkRpc("anvil_stopImpersonatingAccount", [source]);
  }

  if (await input.read.getBalanceOf(input.token, input.owner) < input.amountAtomic) {
    throw new Error("Fork principal funding was not reproduced");
  }
}
