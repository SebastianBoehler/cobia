import { decodeFunctionData, erc20Abi, isAddress, isAddressEqual,
  type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import { commitment, isNativeAssetAddress } from "@cobia/domain";
import { signOkxRequest, type OkxCredentials } from "./auth";

const ORIGIN = "https://web3.okx.com";
const SWAP_PATH = "/api/v6/dex/aggregator/swap";
const AddressSchema = z.string().refine(isAddress).transform((value) => value.toLowerCase() as Address);
const AtomicSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const PositiveAtomicSchema = z.string().regex(/^[1-9][0-9]*$/);
const HexSchema = z.string().regex(/^0x(?:[0-9a-fA-F]{2})+$/).transform((value) => value.toLowerCase() as Hex);
const TokenSchema = z.object({ tokenContractAddress: AddressSchema, isHoneyPot: z.literal(false),
  taxRate: z.literal("0") }).passthrough();
const EnvelopeSchema = z.object({ code: z.literal("0"), msg: z.string(), data: z.array(z.unknown()).length(1) });
const ApprovalSignatureSchema = z.object({ approveContract: AddressSchema,
  approveTxCalldata: HexSchema }).strict();
const SwapSchema = z.object({ routerResult: z.object({ chainIndex: z.enum(["1", "196"]),
  swapMode: z.literal("exactIn"), fromTokenAmount: PositiveAtomicSchema,
  toTokenAmount: PositiveAtomicSchema, fromToken: TokenSchema, toToken: TokenSchema }).passthrough(),
  tx: z.object({ from: AddressSchema, to: AddressSchema, value: AtomicSchema,
    minReceiveAmount: PositiveAtomicSchema, slippagePercent: z.string(), data: HexSchema,
    gas: PositiveAtomicSchema, signatureData: z.array(z.string()).max(1) }).passthrough() }).passthrough();

export interface GeneralAssetSwapCompileRequestV1 {
  chainId: 1 | 196;
  executor: Address;
  owner: Address;
  inputToken: Address;
  outputToken: Address;
  inputAtomic: string;
  minimumOutputAtomic: string;
  maximumSlippageBps: number;
}

function slippagePercent(bps: number): string {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error("Swap slippage is invalid");
  const whole = Math.floor(bps / 100);
  const fraction = String(bps % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function query(path: string, values: Record<string, string>): string {
  return `${path}?${new URLSearchParams(values).toString()}`;
}

export function createOkxGeneralAssetSwapCompilerV1(options: {
  credentials: OkxCredentials;
  fetch?: typeof fetch;
  now?: () => Date;
}) {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  async function get(path: string) {
    const timestamp = now().toISOString();
    const response = await fetchImpl(`${ORIGIN}${path}`, { method: "GET",
      headers: signOkxRequest({ ...options.credentials, timestamp, method: "GET", path }),
      cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`OKX compiler returned HTTP ${response.status}`);
    const envelope = EnvelopeSchema.parse(await response.json());
    return envelope.data[0];
  }
  return { async compile(input: GeneralAssetSwapCompileRequestV1) {
    const slip = slippagePercent(input.maximumSlippageBps);
    const nativeInput = isNativeAssetAddress(input.inputToken);
    const requestValues = { chainIndex: String(input.chainId), amount: input.inputAtomic,
      fromTokenAddress: input.inputToken.toLowerCase(), toTokenAddress: input.outputToken.toLowerCase(),
      slippagePercent: slip, userWalletAddress: input.executor.toLowerCase(),
      swapReceiverAddress: input.owner.toLowerCase(), swapMode: "exactIn",
      disableRFQ: "true", approveTransaction: nativeInput ? "false" : "true",
      ...(nativeInput ? {} : { approveAmount: input.inputAtomic }) };
    const swapRequest = query(SWAP_PATH, requestValues);
    const swapRaw = await get(swapRequest);
    const swap = SwapSchema.parse(swapRaw);
    let approval: z.infer<typeof ApprovalSignatureSchema> | undefined;
    if (!nativeInput) {
      try {
        approval = ApprovalSignatureSchema.parse(JSON.parse(swap.tx.signatureData[0]!));
      } catch (error) {
        throw new Error("OKX approval compilation is invalid", { cause: error });
      }
      const decoded = decodeFunctionData({ abi: erc20Abi, data: approval.approveTxCalldata });
      if (decoded.functionName !== "approve" || !isAddressEqual(decoded.args[0], approval.approveContract) ||
          decoded.args[1] !== BigInt(input.inputAtomic)) throw new Error("OKX approval compilation mismatch");
    } else if (swap.tx.signatureData.length) {
      throw new Error("OKX native compilation returned unexpected approval metadata");
    }
    const route = swap.routerResult;
    const tx = swap.tx;
    if (route.chainIndex !== String(input.chainId) || route.fromTokenAmount !== input.inputAtomic ||
        !isAddressEqual(route.fromToken.tokenContractAddress, input.inputToken) ||
        !isAddressEqual(route.toToken.tokenContractAddress, input.outputToken) ||
        BigInt(route.toTokenAmount) < BigInt(input.minimumOutputAtomic)) {
      throw new Error("OKX route asset mismatch");
    }
    if (!isAddressEqual(tx.from, input.executor)) throw new Error("OKX swap sender mismatch");
    const expectedValue = nativeInput ? input.inputAtomic : "0";
    if (tx.value !== expectedValue) throw new Error("OKX swap value mismatch");
    if (tx.slippagePercent !== slip) throw new Error("OKX swap slippage mismatch");
    if (BigInt(tx.minReceiveAmount) < BigInt(input.minimumOutputAtomic)) {
      throw new Error("OKX swap minimum output mismatch");
    }
    const gasLimit = Number(tx.gas);
    if (!Number.isSafeInteger(gasLimit) || gasLimit < 21_000 || gasLimit > 1_000_000) {
      throw new Error("OKX swap gas limit is invalid");
    }
    const fetchedAtSec = Math.floor(now().getTime() / 1_000);
    const source = { swapRequest, swap: swapRaw };
    return { target: tx.to, data: tx.data, valueAtomic: expectedValue, gasLimit,
      ...(approval ? { approval: { spender: approval.approveContract,
        maximumAtomic: input.inputAtomic, data: approval.approveTxCalldata } } : {}),
      quoteHash: commitment(source) as Hash,
      fetchedAtSec, expiresAtSec: fetchedAtSec + 30, source };
  } };
}
