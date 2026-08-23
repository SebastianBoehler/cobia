import type { PlainErc20ProbeV1 } from "@cobia/solvers";
import {
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  isHash,
  toFunctionSelector,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { z } from "zod";

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => value.toLowerCase() as Address);
export const AssetEvidenceReplaySchema = z.object({
  chainId: z.union([z.literal(1), z.literal(196)]),
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  token: AddressSchema,
  source: AddressSchema,
  probeAtomic: z.string().regex(/^[1-9][0-9]*$/),
}).strict();

type Rpc = (method: string, params?: readonly unknown[]) => Promise<unknown>;
const RECIPIENT = "0x00000000000000000000000000000000000000a1" as const;
const RECIPIENT_2 = "0x00000000000000000000000000000000000000a2" as const;
const SPENDER = "0x00000000000000000000000000000000000000b1" as const;
const GAS = "0x56bc75e2d63100000";

async function call(rpc: Rpc, token: Address, from: Address, data: Hex): Promise<Hex> {
  const result = await rpc("eth_call", [{ from, to: token, data }, "latest"]);
  if (typeof result !== "string" || !result.startsWith("0x")) throw new Error("Invalid ERC-20 call result");
  return result as Hex;
}

async function uint256(rpc: Rpc, token: Address, functionName: "balanceOf" | "allowance",
  args: readonly [Address] | readonly [Address, Address]): Promise<bigint> {
  const data = encodeFunctionData({ abi: erc20Abi, functionName, args } as never);
  return decodeFunctionResult({ abi: erc20Abi, functionName, data: await call(rpc, token, args[0], data) } as never) as bigint;
}

async function returnKind(rpc: Rpc, token: Address, from: Address, data: Hex) {
  try {
    const value = await call(rpc, token, from, data);
    if (value === "0x") return "none" as const;
    return decodeFunctionResult({ abi: erc20Abi, functionName: "transfer", data: value })
      ? "true" as const : "false" as const;
  } catch {
    return "false" as const;
  }
}

async function send(rpc: Rpc, token: Address, from: Address, data: Hex): Promise<Hash> {
  const hash = await rpc("eth_sendTransaction", [{ from, to: token, data }]);
  if (typeof hash !== "string" || !isHash(hash)) throw new Error("Fork returned an invalid transaction hash");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const receipt = await rpc("eth_getTransactionReceipt", [hash]) as null | { status?: Hex };
    if (receipt) {
      if (BigInt(receipt.status ?? "0x0") !== 1n) throw new Error("ERC-20 probe transaction reverted");
      return hash;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("ERC-20 probe receipt timed out");
}

function nestedCalls(frame: unknown): number {
  const value = frame as { type?: string; calls?: unknown[] };
  return (value.calls ?? []).reduce<number>((total, child) => {
    const kind = String((child as { type?: string }).type ?? "CALL").toUpperCase();
    const callback = kind === "CALL" || kind === "STATICCALL" ? 1 : 0;
    return total + callback + nestedCalls(child);
  }, 0);
}

const BLACKLIST_SELECTORS = ["pause()", "blacklist(address)", "setBlacklist(address,bool)",
  "freeze(address)", "setBlocked(address,bool)"].map(toFunctionSelector);
const ADMIN_BALANCE_SELECTORS = ["mint(address,uint256)", "wipeBlacklistedAddress(address)",
  "destroyBlackFunds(address)"].map(toFunctionSelector);
const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function controlSurfaceRuntime(rpc: Rpc, token: Address): Promise<string> {
  const runtime = String(await rpc("eth_getCode", [token, "latest"])).toLowerCase();
  const word = String(await rpc("eth_getStorageAt", [token, EIP1967_IMPLEMENTATION_SLOT, "latest"]));
  if (!/^0x[0-9a-fA-F]{64}$/.test(word) || /^0x0{64}$/.test(word)) return runtime;
  const implementation = `0x${word.slice(-40)}` as Address;
  const implementationRuntime = String(await rpc("eth_getCode", [implementation, "latest"])).toLowerCase();
  return `${runtime}${implementationRuntime.slice(2)}`;
}

export async function probePlainErc20OnFork(
  raw: z.input<typeof AssetEvidenceReplaySchema>,
  rpc: Rpc,
): Promise<PlainErc20ProbeV1> {
  const input = AssetEvidenceReplaySchema.parse(raw);
  if (Number(BigInt(String(await rpc("eth_chainId")))) !== input.chainId) {
    throw new Error("Asset probe chain ID mismatch");
  }
  const amount = BigInt(input.probeAtomic);
  const transfer = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [RECIPIENT, amount] });
  const approve = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [SPENDER, amount] });
  const transferFrom = encodeFunctionData({ abi: erc20Abi, functionName: "transferFrom",
    args: [input.source, RECIPIENT_2, amount] });
  const [transferReturn, approveReturn, replayReturn] = await Promise.all([
    returnKind(rpc, input.token, input.source, transfer),
    returnKind(rpc, input.token, input.source, approve),
    returnKind(rpc, input.token, input.source, transfer),
  ]);
  const sourceBefore = await uint256(rpc, input.token, "balanceOf", [input.source]);
  if (sourceBefore < amount * 2n) throw new Error("Asset probe source balance is insufficient");
  const recipientBefore = await uint256(rpc, input.token, "balanceOf", [RECIPIENT]);
  await rpc("anvil_setBalance", [input.source, GAS]);
  await rpc("anvil_setBalance", [SPENDER, GAS]);
  await rpc("anvil_impersonateAccount", [input.source]);
  await rpc("anvil_impersonateAccount", [SPENDER]);
  const hashes: Hash[] = [];
  try {
    hashes.push(await send(rpc, input.token, input.source, transfer));
    const sourceAfterTransfer = await uint256(rpc, input.token, "balanceOf", [input.source]);
    const recipientAfter = await uint256(rpc, input.token, "balanceOf", [RECIPIENT]);
    hashes.push(await send(rpc, input.token, input.source, approve));
    const allowanceBefore = await uint256(rpc, input.token, "allowance", [input.source, SPENDER]);
    const transferFromReturn = await returnKind(rpc, input.token, SPENDER, transferFrom);
    hashes.push(await send(rpc, input.token, SPENDER, transferFrom));
    const allowanceAfter = await uint256(rpc, input.token, "allowance", [input.source, SPENDER]);
    hashes.push(await send(rpc, input.token, input.source,
      encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [SPENDER, 0n] })));
    const cleanup = await uint256(rpc, input.token, "allowance", [input.source, SPENDER]);
    const stableA = await uint256(rpc, input.token, "balanceOf", [input.source]);
    const stableB = await uint256(rpc, input.token, "balanceOf", [input.source]);
    const traces = await Promise.all(hashes.map((hash) => rpc("debug_traceTransaction", [hash,
      { tracer: "callTracer" }]).catch(() => ({ calls: [{}] }))));
    const runtime = await controlSurfaceRuntime(rpc, input.token);
    return {
      transferReturn, transferFromReturn, approveReturn,
      transferAtomic: amount.toString(),
      senderDecreaseAtomic: (sourceBefore - sourceAfterTransfer).toString(),
      recipientIncreaseAtomic: (recipientAfter - recipientBefore).toString(),
      allowanceDecreaseAtomic: (allowanceBefore - allowanceAfter).toString(),
      approvalCleanupSucceeded: cleanup === 0n,
      replayDeterministic: transferReturn === replayReturn,
      balancesStableWithoutTransfers: stableA === stableB,
      callbackCount: traces.reduce<number>((total, trace) => total + nestedCalls(trace), 0),
      blacklistOrPauseSurface: BLACKLIST_SELECTORS.some((selector) => runtime.includes(selector.slice(2))),
      adminBalanceControlSurface: ADMIN_BALANCE_SELECTORS.some((selector) => runtime.includes(selector.slice(2))),
    };
  } finally {
    await rpc("anvil_stopImpersonatingAccount", [SPENDER]).catch(() => undefined);
    await rpc("anvil_stopImpersonatingAccount", [input.source]).catch(() => undefined);
  }
}
