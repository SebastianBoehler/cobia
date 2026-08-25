import {
  commitment,
  isNativeAssetAddress,
  TransactionStageV1Schema,
  type TransactionStageV1,
} from "@cobia/domain";
import {
  concatHex,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  toHex,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import {
  OkxAnchorV1Schema,
  OkxSwapArtifactV1Schema,
  OkxVerifierManifestV1Schema,
  type OkxAnchorV1,
  type OkxSwapArtifactV1,
} from "./wire";

export const OKX_MAX_QUOTE_VALIDITY_SEC = 120;

export interface OkxSwapSimulationV1 {
  reproduced: boolean;
  transactionSuccess: boolean;
  completeOwnerAssetDiff: boolean;
  transactionDataHash: Hash;
  gasUsed: string;
  observedInputDecreaseAtomic: string;
  observedOutputIncreaseAtomic: string;
  unexpectedOwnerAssetDecreases: Address[];
  residualAllowanceAtomic: string;
  traceHash: Hash;
  stateDiffHash: Hash;
}

interface VerificationInputV1 {
  stage: unknown;
  artifact: unknown;
  manifest: unknown;
  anchor: unknown;
  nowSec: number;
  currentAllowanceAtomic: unknown;
  confirmAnchor(anchor: OkxAnchorV1): Promise<boolean>;
  getCodeHash(chainId: 196, address: Address, blockNumber: string): Promise<Hash | undefined>;
  simulate(input: { artifact: OkxSwapArtifactV1; anchor: OkxAnchorV1 }): Promise<OkxSwapSimulationV1>;
}

interface UnsignedCallV1 { to: Address; data: Hex; value: Hex }
export type OkxSwapAuthorizationV1 =
  | { accepted: false; errorCodes: string[] }
  | { accepted: true; calls: UnsignedCallV1[] };
export type OkxSwapVerificationV1 =
  | { accepted: false; errorCodes: string[] }
  | { accepted: true; calls: UnsignedCallV1[]; evidence: {
    traceHash: Hash; stateDiffHash: Hash; verificationHash: Hash;
  } };

function reject(...errorCodes: string[]): OkxSwapVerificationV1 {
  return { accepted: false, errorCodes: [...new Set(errorCodes)].sort() };
}

function walletStage(input: unknown): Extract<TransactionStageV1, { kind: "wallet-transaction" }> | undefined {
  const parsed = TransactionStageV1Schema.safeParse(input);
  return parsed.success && parsed.data.kind === "wallet-transaction" ? parsed.data : undefined;
}

export function authorizeOkxSwapStageV1(raw: Pick<VerificationInputV1,
  "stage" | "artifact" | "manifest" | "nowSec" | "currentAllowanceAtomic"
>): OkxSwapAuthorizationV1 {
  const stage = walletStage(raw.stage);
  const artifact = OkxSwapArtifactV1Schema.safeParse(raw.artifact);
  const manifest = OkxVerifierManifestV1Schema.safeParse(raw.manifest);
  const allowance = typeof raw.currentAllowanceAtomic === "string" &&
    /^(0|[1-9][0-9]*)$/.test(raw.currentAllowanceAtomic) && raw.currentAllowanceAtomic.length <= 78
    ? raw.currentAllowanceAtomic : undefined;
  if (!stage || !artifact.success || !manifest.success) {
    return reject("OKX_INPUT_INVALID");
  }
  if (stage.provider !== "okx.dex@1") return reject("OKX_PROVIDER_MISMATCH");

  const nativeInput = isNativeAssetAddress(stage.input.token);
  if (!nativeInput && allowance === undefined) return reject("OKX_INPUT_INVALID");

  const request = artifact.data.request;
  const response = artifact.data.response.data[0]!;
  const route = response.routerResult;
  const tx = response.tx;
  const finalData = concatHex([tx.data, manifest.data.builderDataSuffix]);
  const errors: string[] = [];
  if (artifact.data.stageId !== stage.id) errors.push("OKX_STAGE_MISMATCH");
  if (artifact.data.fetchedAt !== stage.fetchedAt || artifact.data.expiresAt !== stage.expiresAt ||
      raw.nowSec < stage.fetchedAt || raw.nowSec >= stage.expiresAt ||
      stage.expiresAt - stage.fetchedAt > OKX_MAX_QUOTE_VALIDITY_SEC) {
    errors.push("OKX_QUOTE_STALE");
  }
  if (commitment(request) !== stage.quoteHash || commitment(artifact.data.response) !== stage.responseHash) {
    errors.push("OKX_COMMITMENT_MISMATCH");
  }
  if (request.userWalletAddress !== stage.sender || request.swapReceiverAddress !== stage.recipient ||
      tx.from !== stage.sender) errors.push("OKX_OWNER_MISMATCH");
  if (request.fromTokenAddress !== stage.input.token || request.amount !== stage.input.atomic ||
      route.fromToken.tokenContractAddress !== stage.input.token || route.fromTokenAmount !== stage.input.atomic) {
    errors.push("OKX_INPUT_MISMATCH");
  }
  if (request.toTokenAddress !== stage.output.token || route.toToken.tokenContractAddress !== stage.output.token ||
      BigInt(tx.minReceiveAmount) < BigInt(stage.output.minimumAtomic)) errors.push("OKX_OUTPUT_MISMATCH");
  if (request.slippagePercent !== tx.slippagePercent) errors.push("OKX_SLIPPAGE_MISMATCH");
  if (tx.to !== manifest.data.router.address || tx.to !== stage.transaction.target) errors.push("OKX_ROUTER_MISMATCH");
  const expectedValue = nativeInput ? stage.input.atomic : "0";
  if (tx.value !== stage.transaction.valueAtomic || tx.value !== expectedValue) {
    errors.push("OKX_VALUE_MISMATCH");
  }
  if (artifact.data.attributedData !== finalData || keccak256(finalData) !== stage.transaction.dataHash) {
    errors.push("OKX_CALLDATA_MISMATCH");
  }
  if (tx.data.slice(0, 10) !== stage.transaction.selector ||
      !manifest.data.router.selectors.includes(stage.transaction.selector)) errors.push("OKX_SELECTOR_FORBIDDEN");
  if (nativeInput ? stage.approval !== undefined :
      !stage.approval || stage.approval.token !== stage.input.token ||
      stage.approval.spender !== manifest.data.approval.address ||
      stage.approval.maximumAtomic !== stage.input.atomic) errors.push("OKX_APPROVAL_MISMATCH");
  if (errors.length) return reject(...errors);

  const calls: UnsignedCallV1[] = [];
  if (nativeInput) {
    calls.push({ to: tx.to, data: finalData, value: toHex(BigInt(tx.value)) });
    return { accepted: true, calls };
  }
  if (BigInt(allowance!) > 0n) calls.push({
    to: stage.approval!.token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [stage.approval!.spender, 0n],
    }),
    value: "0x0",
  });
  calls.push({
    to: stage.approval!.token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [stage.approval!.spender, BigInt(stage.approval!.maximumAtomic)],
    }),
    value: "0x0",
  }, { to: tx.to, data: finalData, value: "0x0" });
  return { accepted: true, calls };
}

export async function verifyOkxSwapStageV1(raw: VerificationInputV1): Promise<OkxSwapVerificationV1> {
  const authorization = authorizeOkxSwapStageV1(raw);
  if (!authorization.accepted) return authorization;
  const stage = walletStage(raw.stage)!;
  const artifact = OkxSwapArtifactV1Schema.parse(raw.artifact);
  const manifest = OkxVerifierManifestV1Schema.parse(raw.manifest);
  const anchor = OkxAnchorV1Schema.safeParse(raw.anchor);
  if (!anchor.success) return reject("OKX_INPUT_INVALID");
  const tx = artifact.response.data[0]!.tx;

  if (!await raw.confirmAnchor(anchor.data)) return reject("OKX_ANCHOR_REORGED");
  const identities = stage.approval ? [manifest.router, manifest.approval] : [manifest.router];
  for (const identity of identities) {
    if (await raw.getCodeHash(196, identity.address, anchor.data.blockNumber) !== identity.runtimeCodeHash) {
      return reject("OKX_CODE_IDENTITY_CHANGED");
    }
  }
  const simulation = await raw.simulate({ artifact, anchor: anchor.data });
  if (!simulation.reproduced || !simulation.transactionSuccess || !simulation.completeOwnerAssetDiff ||
      simulation.transactionDataHash !== stage.transaction.dataHash) return reject("OKX_SIMULATION_NOT_REPRODUCED");
  if (!/^[1-9][0-9]*$/.test(simulation.gasUsed) || BigInt(simulation.gasUsed) > BigInt(tx.gas) * 3n / 2n) {
    return reject("OKX_GAS_LIMIT_EXCEEDED");
  }
  if (BigInt(simulation.observedInputDecreaseAtomic) > BigInt(stage.input.atomic)) return reject("OKX_OVERSPEND");
  if (BigInt(simulation.observedOutputIncreaseAtomic) < BigInt(stage.output.minimumAtomic)) {
    return reject("OKX_OUTPUT_TOO_LOW");
  }
  if (simulation.unexpectedOwnerAssetDecreases.length) return reject("OKX_UNDECLARED_ASSET_DECREASE");
  if (stage.approval && simulation.residualAllowanceAtomic !== "0") {
    return reject("OKX_RESIDUAL_ALLOWANCE");
  }

  return { accepted: true, calls: authorization.calls, evidence: {
    traceHash: simulation.traceHash,
    stateDiffHash: simulation.stateDiffHash,
    verificationHash: commitment({ stage, artifact, anchor: anchor.data, simulation }) as Hash,
  } };
}
