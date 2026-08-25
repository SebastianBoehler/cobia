import { decodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { formatTokenAmount } from "../../lib/token-amount";

interface Call { to: Address; data: Hex }
interface Token { token: string; symbol: string; decimals: number }

export function exactApprovalLabel(call: Call, tokens: Token[]) {
  if (call.data.slice(0, 10).toLowerCase() !== "0x095ea7b3") return undefined;
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: call.data });
    if (decoded.functionName !== "approve") return undefined;
    const token = tokens.find(({ token }) => token.toLowerCase() === call.to.toLowerCase());
    const symbol = token?.symbol ?? "token";
    if (decoded.args[1] === 0n) return { label: `Reset ${symbol} allowance`, symbol };
    const amount = formatTokenAmount(decoded.args[1].toString(), token?.decimals ?? 6)
      .replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
    return { label: `Allow exactly ${amount} ${symbol}`, symbol };
  } catch {
    return undefined;
  }
}
