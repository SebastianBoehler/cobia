import { GeneralAssetCallV1Schema, GeneralAssetStageV1Schema, NATIVE_ASSET_ADDRESS,
  commitment, isNativeAssetAddress } from "@cobia/domain";
import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  isHash,
  keccak256,
  toHex,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { z } from "zod";

const AddressSchema = z.string().regex(/^0x[0-9a-f]{40}$/).transform((value) => value as Address);
const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/).transform((value) => value as Hash);
const CompiledCallSchema = z.object({ adapterKey: HashSchema,
  target: AddressSchema, targetRuntimeCodeHash: HashSchema,
  data: z.string().regex(/^0x(?:[0-9a-f]{2}){4,8192}$/).transform((value) => value as Hex),
  valueAtomic: z.string().regex(/^(0|[1-9][0-9]*)$/),
  gasLimit: z.number().int().min(21_000).max(1_000_000),
  approvals: GeneralAssetCallV1Schema.shape.approvals,
  quoteHash: HashSchema, expiresAtSec: z.number().int().positive().safe(),
}).strict();
const CompiledSchema = z.object({
  stageId: HashSchema, chainId: z.union([z.literal(1), z.literal(196)]),
  calls: z.array(CompiledCallSchema).min(1).max(8),
  refundTokens: GeneralAssetStageV1Schema.shape.refundTokens,
  quoteHash: HashSchema, expiresAtSec: z.number().int().positive().safe(),
}).strict();
export const GeneralAssetStageReplayRequestSchema = z.object({
  chainId: z.union([z.literal(1), z.literal(196)]),
  blockNumber: z.string().regex(/^[1-9][0-9]*$/),
  blockHash: HashSchema, owner: AddressSchema, executor: AddressSchema,
  stage: GeneralAssetStageV1Schema, compiled: CompiledSchema,
}).strict();

type Rpc = (method: string, params?: readonly unknown[]) => Promise<unknown>;
const GAS_BALANCE = "0x56bc75e2d63100000";

async function call(rpc: Rpc, token: Address, data: Hex): Promise<Hex> {
  const value = await rpc("eth_call", [{ to: token, data }, "latest"]);
  if (typeof value !== "string" || !value.startsWith("0x")) throw new Error("Fork ERC-20 read is invalid");
  return value as Hex;
}

async function balance(rpc: Rpc, token: Address, account: Address): Promise<bigint> {
  if (isNativeAssetAddress(token)) {
    const value = await rpc("eth_getBalance", [account, "latest"]);
    if (typeof value !== "string" || !value.startsWith("0x")) {
      throw new Error("Fork native balance read is invalid");
    }
    return BigInt(value);
  }
  const data = await call(rpc, token, encodeFunctionData({
    abi: erc20Abi, functionName: "balanceOf", args: [account],
  }));
  return decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data });
}

async function allowance(rpc: Rpc, token: Address, owner: Address, spender: Address): Promise<bigint> {
  const data = await call(rpc, token, encodeFunctionData({
    abi: erc20Abi, functionName: "allowance", args: [owner, spender],
  }));
  return decodeFunctionResult({ abi: erc20Abi, functionName: "allowance", data });
}

function balanceKey(account: Address, slot: bigint): Hash {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [account, slot]));
}

async function discoverBalanceSlot(rpc: Rpc, token: Address, account: Address): Promise<bigint> {
  const marker = 0x5a17n;
  for (let slot = 0n; slot < 128n; slot += 1n) {
    const checkpoint = await rpc("evm_snapshot");
    try {
      await rpc("anvil_setStorageAt", [token, balanceKey(account, slot), toHex(marker, { size: 32 })]);
      if (await balance(rpc, token, account) === marker) return slot;
    } finally {
      await rpc("evm_revert", [checkpoint]);
    }
  }
  throw new Error("Plain ERC-20 balance storage could not be seeded for replay");
}

async function receipt(rpc: Rpc, hash: Hash) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await rpc("eth_getTransactionReceipt", [hash]) as null | {
      status: Hex; gasUsed: Hex; logs: unknown[];
    };
    if (value) {
      if (BigInt(value.status) !== 1n) throw new Error("General asset replay transaction reverted");
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("General asset replay receipt timed out");
}

async function send(rpc: Rpc, from: Address, to: Address, data: Hex, value = 0n, gas = 1_000_000) {
  await rpc("anvil_setNextBlockBaseFeePerGas", ["0x0"]);
  const result = await rpc("eth_sendTransaction", [{ from, to, data, value: toHex(value),
    gas: toHex(gas), gasPrice: "0x0" }]);
  if (typeof result !== "string" || !isHash(result)) throw new Error("Fork transaction hash is invalid");
  return { hash: result, receipt: await receipt(rpc, result) };
}

export async function replayGeneralAssetStageOnFork(inputValue: unknown, rpc: Rpc) {
  const input = GeneralAssetStageReplayRequestSchema.parse(inputValue);
  const { stage, compiled } = input;
  if (input.chainId !== stage.chainId || compiled.chainId !== stage.chainId ||
      compiled.stageId !== stage.stageId || compiled.calls.length !== stage.calls.length ||
      compiled.calls.some((call, index) => {
        const expected = stage.calls[index]!;
        return call.target !== expected.target || call.data !== expected.calldata ||
          call.valueAtomic !== expected.nativeValueAtomic ||
          call.gasLimit !== expected.gasLimit ||
          commitment(call.approvals) !== commitment(expected.approvals);
      }) ||
      commitment(compiled.refundTokens) !== commitment(stage.refundTokens)) {
    throw new Error("General asset compiled stage does not match replay request");
  }
  for (const call of stage.calls) {
    const code = await rpc("eth_getCode", [call.target, "latest"]);
    if (typeof code !== "string" || code === "0x" ||
        keccak256(code as Hex) !== call.targetRuntimeCodeHash) {
      throw new Error("General asset replay target code changed");
    }
  }
  const tokens = [...new Set([stage.input.token, ...stage.outputs.map(({ token }) => token),
    ...stage.refundTokens])].sort();
  const ownerBefore = new Map(await Promise.all(tokens.map(async (token) =>
    [token, await balance(rpc, token, input.owner)] as const)));
  const seeded = BigInt(stage.input.maximumAtomic);
  if (isNativeAssetAddress(stage.input.token)) {
    await rpc("anvil_setBalance", [input.executor, toHex(BigInt(GAS_BALANCE) + seeded)]);
  } else {
    const slot = await discoverBalanceSlot(rpc, stage.input.token, input.executor);
    await rpc("anvil_setStorageAt", [stage.input.token, balanceKey(input.executor, slot),
      toHex(seeded, { size: 32 })]);
    await rpc("anvil_setBalance", [input.executor, GAS_BALANCE]);
  }
  await rpc("anvil_impersonateAccount", [input.executor]);
  const transactions: Awaited<ReturnType<typeof send>>[] = [];
  try {
    for (const call of compiled.calls) {
      for (const approval of call.approvals) {
        transactions.push(await send(rpc, input.executor, approval.token, encodeFunctionData({
          abi: erc20Abi, functionName: "approve", args: [approval.spender, 0n],
        })));
        transactions.push(await send(rpc, input.executor, approval.token, encodeFunctionData({
          abi: erc20Abi, functionName: "approve", args: [approval.spender, BigInt(approval.maximumAtomic)],
        })));
      }
      transactions.push(await send(rpc, input.executor, call.target, call.data,
        BigInt(call.valueAtomic), call.gasLimit));
      for (const approval of call.approvals) transactions.push(await send(
        rpc, input.executor, approval.token, encodeFunctionData({
          abi: erc20Abi, functionName: "approve", args: [approval.spender, 0n],
        }),
      ));
    }
    for (const token of tokens) {
      if (isNativeAssetAddress(token)) continue;
      const amount = await balance(rpc, token, input.executor);
      if (amount > 0n) transactions.push(await send(rpc, input.executor, token, encodeFunctionData({
        abi: erc20Abi, functionName: "transfer", args: [input.owner, amount],
      })));
    }
    if (tokens.some(isNativeAssetAddress)) {
      const nativeBalance = await balance(rpc, NATIVE_ASSET_ADDRESS, input.executor);
      const amount = nativeBalance - BigInt(GAS_BALANCE);
      if (amount > 0n) transactions.push(await send(rpc, input.executor, input.owner, "0x", amount, 21_000));
    }
  } finally {
    await rpc("anvil_stopImpersonatingAccount", [input.executor]);
  }
  const ownerAssetDeltas = await Promise.all(tokens.map(async (token) => {
    const observed = await balance(rpc, token, input.owner) - ownerBefore.get(token)!;
    return { token, deltaAtomic: (observed - (token === stage.input.token ? seeded : 0n)).toString() };
  }));
  const approvals = compiled.calls.flatMap(({ approvals }) => approvals);
  const endingAllowances = await Promise.all(approvals.map(async ({ token, spender }) =>
    ({ token, spender, atomic: (await allowance(rpc, token, input.executor, spender)).toString() })));
  const traces = await Promise.all(transactions.map(({ hash }) =>
    rpc("debug_traceTransaction", [hash, { tracer: "callTracer" }])));
  const stateDiffs = await Promise.all(transactions.map(({ hash }) => rpc("debug_traceTransaction", [hash,
    { tracer: "prestateTracer", tracerConfig: { diffMode: true } }])));
  return { stageId: stage.stageId, chainId: stage.chainId, blockNumber: input.blockNumber,
    blockHash: input.blockHash, compiledCallHash: commitment(compiled), matchesCompiledCalls: true,
    success: true, gasUsed: transactions.reduce((sum, value) => sum + BigInt(value.receipt.gasUsed), 0n).toString(),
    ownerAssetDeltas, endingAllowances, traceHash: commitment(traces), stateDiffHash: commitment(stateDiffs) };
}
