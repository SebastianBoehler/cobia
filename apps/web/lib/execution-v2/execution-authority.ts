import { isAddress, isAddressEqual, type Address } from "viem";
import type {
  ExecutionReadClientV2,
  ExecutionWalletV2,
} from "./engine-types";
import { EXECUTION_CHAIN_ID } from "./types";

function walletChainId(value: unknown): number {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
    throw new Error("Wallet returned a malformed chain ID");
  }
  const chainId = Number(BigInt(value));
  if (!Number.isSafeInteger(chainId)) throw new Error("Wallet chain ID is unsafe");
  return chainId;
}

function assertWalletOwner(value: unknown, expectedOwner: Address): void {
  if (!Array.isArray(value) || typeof value[0] !== "string" || !isAddress(value[0]) ||
    !isAddressEqual(value[0], expectedOwner)) {
    throw new Error("Active wallet account does not match the execution owner");
  }
}

export async function assertExecutionAuthorityV2(
  wallet: ExecutionWalletV2,
  readClient: ExecutionReadClientV2,
  owner: Address,
): Promise<void> {
  if (walletChainId(await wallet.request({ method: "eth_chainId" })) !==
    EXECUTION_CHAIN_ID) {
    throw new Error("Wallet must be connected to X Layer chain 196");
  }
  assertWalletOwner(await wallet.request({ method: "eth_accounts" }), owner);
  await assertExecutionReadChainV2(readClient);
}

export async function assertExecutionReadChainV2(
  readClient: ExecutionReadClientV2,
): Promise<void> {
  if (await readClient.getChainId() !== EXECUTION_CHAIN_ID) {
    throw new Error("Execution read client must use X Layer chain 196");
  }
}
