import {
  commitment, isNativeAssetAddress, OpenIntentSnapshotV1Schema, TransactionProgramV1Schema,
} from "@cobia/domain";
import {
  ProviderArtifactsV1Schema,
  TransactionProgramEvidenceV1Schema,
  XLAYER_OKX_MANIFEST_V1,
  authorizeOkxSwapStageV1,
  verifyRawWalletStageV1,
} from "@cobia/solvers";
import {
  decodeFunctionResult, encodeFunctionData, erc20Abi, getAddress, keccak256,
  toEventSelector, type Address, type Hash, type Hex,
} from "viem";

type Rpc = (method: string, params?: readonly unknown[]) => Promise<unknown>;
type Log = { address: Address; data: Hex; topics: Hash[] };
type Receipt = { status: Hex; gasUsed: Hex; logs: Log[] };
type CallTrace = { from?: Address; to?: Address; value?: Hex; calls?: CallTrace[] };
const TRANSFER = toEventSelector("Transfer(address,address,uint256)").toLowerCase();
const APPROVAL = toEventSelector("Approval(address,address,uint256)").toLowerCase();
const GAS_BALANCE = "0x56bc75e2d63100000";

function topicAddress(value: string | undefined): Address | undefined {
  return value && /^0x[0-9a-fA-F]{64}$/.test(value)
    ? getAddress(`0x${value.slice(-40)}`).toLowerCase() as Address : undefined;
}

async function receipt(rpc: Rpc, hash: Hash): Promise<Receipt> {
  for (let attempt = 0; attempt < 100; ++attempt) {
    const value = await rpc("eth_getTransactionReceipt", [hash]) as Receipt | null;
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Fork transaction receipt timed out");
}

async function tokenBalance(rpc: Rpc, token: Address, owner: Address): Promise<bigint> {
  if (isNativeAssetAddress(token)) {
    const value = await rpc("eth_getBalance", [owner, "latest"]);
    if (typeof value !== "string") throw new Error("Fork native balance is invalid");
    return BigInt(value);
  }
  const value = await rpc("eth_call", [{ to: token,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [owner] }) }, "latest"]);
  if (typeof value !== "string") throw new Error("Fork token balance is invalid");
  return decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: value as Hex });
}

function nativeOwnerFlow(trace: CallTrace, owner: Address): bigint {
  const value = trace.value ? BigInt(trace.value) : 0n;
  const fromOwner = trace.from?.toLowerCase() === owner;
  const toOwner = trace.to?.toLowerCase() === owner;
  return (toOwner ? value : 0n) - (fromOwner ? value : 0n) +
    (trace.calls ?? []).reduce((sum, call) => sum + nativeOwnerFlow(call, owner), 0n);
}

async function allowance(rpc: Rpc, token: Address, owner: Address, spender: Address): Promise<bigint> {
  const value = await rpc("eth_call", [{ to: token,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [owner, spender] }) }, "latest"]);
  if (typeof value !== "string") throw new Error("Fork allowance is invalid");
  return decodeFunctionResult({ abi: erc20Abi, functionName: "allowance", data: value as Hex });
}

async function codeHash(rpc: Rpc, address: Address): Promise<Hash> {
  const code = await rpc("eth_getCode", [address, "latest"]);
  if (typeof code !== "string" || code === "0x") throw new Error(`Fork target ${address} has no code`);
  return keccak256(code as Hex);
}

async function runCalls(rpc: Rpc, owner: Address, calls: { to: Address; data: Hex; value: Hex }[]) {
  const receipts: Receipt[] = [];
  const traces: unknown[] = [];
  const diffs: unknown[] = [];
  for (const call of calls) {
    const hash = await rpc("eth_sendTransaction", [{ from: owner, to: call.to,
      data: call.data, value: call.value, gas: "0x989680" }]);
    if (typeof hash !== "string") throw new Error("Fork transaction hash is invalid");
    const mined = await receipt(rpc, hash as Hash);
    receipts.push(mined);
    traces.push(await rpc("debug_traceTransaction", [hash, { tracer: "callTracer" }]));
    diffs.push(await rpc("debug_traceTransaction", [hash,
      { tracer: "prestateTracer", tracerConfig: { diffMode: true } }]));
  }
  return { receipts, traces, diffs };
}

function discovered(receipts: Receipt[], owner: Address) {
  const tokens = new Set<Address>();
  const allowances = new Map<string, { token: Address; spender: Address }>();
  for (const { logs } of receipts) for (const log of logs) {
    const event = log.topics[0]?.toLowerCase();
    const left = topicAddress(log.topics[1]);
    const right = topicAddress(log.topics[2]);
    if (event === TRANSFER && (left === owner || right === owner)) tokens.add(log.address.toLowerCase() as Address);
    if (event === APPROVAL && left === owner && right) {
      const token = log.address.toLowerCase() as Address;
      allowances.set(`${token}:${right}`, { token, spender: right });
    }
  }
  return { tokens, allowances };
}

export async function captureOpenTransactionProgramSimulationsV1(input: {
  program: unknown; providerArtifacts: unknown; snapshot: unknown; rpc: Rpc;
}) {
  const program = TransactionProgramV1Schema.parse(input.program);
  const artifacts = ProviderArtifactsV1Schema.parse(input.providerArtifacts);
  const snapshot = OpenIntentSnapshotV1Schema.parse(input.snapshot);
  const owner = program.owner;
  await input.rpc("anvil_setBalance", [owner, GAS_BALANCE]);
  await input.rpc("anvil_impersonateAccount", [owner]);
  const simulations = [];
  try {
    for (const stage of program.stages) {
      if (stage.kind !== "wallet-transaction") continue;
      const anchor = snapshot.anchors.find(({ chainId }) => chainId === stage.chainId);
      const artifact = artifacts.artifacts.find(({ stageId }) => stageId === stage.id);
      if (!anchor || !artifact) throw new Error("Fork provider artifact is unavailable");
      const current = stage.approval
        ? await allowance(input.rpc, stage.approval.token, owner, stage.approval.spender) : 0n;
      const verified = artifact.provider === "evm.raw@1"
        ? verifyRawWalletStageV1({ stage, artifact: artifact.payload,
          currentAllowanceAtomic: current.toString() })
        : artifact.provider === "okx.dex@1"
          ? authorizeOkxSwapStageV1({ stage, artifact: artifact.payload,
            manifest: XLAYER_OKX_MANIFEST_V1, nowSec: stage.fetchedAt,
            currentAllowanceAtomic: current.toString() })
          : { accepted: false as const, errorCodes: ["FORK_PROVIDER_UNSUPPORTED"] };
      if (!verified.accepted) throw new Error(verified.errorCodes.join(","));
      const checkpoint = await input.rpc("evm_snapshot") as string;
      const discoveryRun = await runCalls(input.rpc, owner, verified.calls);
      const found = discovered(discoveryRun.receipts, owner);
      found.tokens.add(stage.input.token);
      found.tokens.add(stage.output.token);
      if (stage.approval) found.allowances.set(`${stage.approval.token}:${stage.approval.spender}`,
        { token: stage.approval.token, spender: stage.approval.spender });
      if (!await input.rpc("evm_revert", [checkpoint])) throw new Error("Fork checkpoint could not be restored");
      const beforeBalances = new Map(await Promise.all([...found.tokens].map(async (token) =>
        [token, await tokenBalance(input.rpc, token, owner)] as const)));
      const beforeAllowances = new Map(await Promise.all([...found.allowances].map(async ([key, value]) =>
        [key, await allowance(input.rpc, value.token, owner, value.spender)] as const)));
      const reproduced = await runCalls(input.rpc, owner, verified.calls);
      const nativeDelta = reproduced.traces.reduce<bigint>((sum, trace) =>
        sum + nativeOwnerFlow(trace as CallTrace, owner), 0n);
      const afterBalances = new Map(await Promise.all([...found.tokens].map(async (token) =>
        [token, isNativeAssetAddress(token)
          ? beforeBalances.get(token)! + nativeDelta
          : await tokenBalance(input.rpc, token, owner)] as const)));
      const logs = reproduced.receipts.flatMap(({ logs }) => logs.map(({ address, data, topics }) =>
        ({ address: address.toLowerCase(), data: data.toLowerCase(), topics: topics.map((value) => value.toLowerCase()) })));
      const required = new Set<Address>([stage.transaction.target]);
      if (!isNativeAssetAddress(stage.output.token)) required.add(stage.output.token);
      if (!isNativeAssetAddress(stage.input.token)) required.add(stage.input.token);
      if (stage.approval) { required.add(stage.approval.token); required.add(stage.approval.spender); }
      simulations.push({ stageId: stage.id, chainId: stage.chainId,
        blockNumber: anchor.blockNumber, blockHash: anchor.blockHash,
        transactionDataHash: stage.transaction.dataHash,
        success: reproduced.receipts.every(({ status }) => BigInt(status) === 1n),
        calldataBytes: verified.calls.reduce((sum, { data }) => sum + (data.length - 2) / 2, 0),
        gasUsed: reproduced.receipts.reduce((sum, value) => sum + BigInt(value.gasUsed), 0n).toString(),
        traceHash: commitment(reproduced.traces), stateDiffHash: commitment(reproduced.diffs),
        eventsHash: commitment(logs), completeAssetCoverage: true,
        assetDeltas: [...found.tokens].sort().map((token) => {
          const before = beforeBalances.get(token)!; const after = afterBalances.get(token)!;
          return { token, account: owner, beforeAtomic: before.toString(), afterAtomic: after.toString(),
            deltaAtomic: (after - before).toString() };
        }),
        allowanceDeltas: await Promise.all([...found.allowances].sort().map(async ([key, value]) => ({
          token: value.token, owner, spender: value.spender,
          beforeAtomic: beforeAllowances.get(key)!.toString(),
          afterAtomic: (await allowance(input.rpc, value.token, owner, value.spender)).toString(),
        }))),
        codeIdentities: await Promise.all([...required].sort().map(async (address) =>
          ({ address: address.toLowerCase() as Address, runtimeCodeHash: await codeHash(input.rpc, address) }))),
      });
    }
  } finally { await input.rpc("anvil_stopImpersonatingAccount", [owner]); }
  return simulations;
}

export async function replayOpenTransactionProgramV1(input: {
  program: unknown; evidence?: unknown; providerArtifacts: unknown; snapshot: unknown; rpc: Rpc;
}) {
  const supplied = input.evidence === undefined
    ? undefined : TransactionProgramEvidenceV1Schema.parse(input.evidence);
  const simulations = await captureOpenTransactionProgramSimulationsV1(input);
  return { reproduced: !supplied || commitment(simulations) === commitment(supplied.simulations), simulations };
}
