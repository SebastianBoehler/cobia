import { isAddressEqual, keccak256, parseAbi, type Address, type Hash, type Hex } from "viem";

const EXECUTOR_ABI = parseAbi(["function riskManager() view returns (address)"]);
const RISK_ABI = parseAbi([
  "function paused() view returns (bool)",
  "function verifierSigner() view returns (address)",
  "function isWalletAuthorized(address) view returns (bool)",
  "function tokenEnabled(address) view returns (bool)",
  "function tokenLimits(address) view returns (uint128 maxRoute,uint128 maxWalletDaily,uint128 maxCumulative)",
]);

export interface AgentExecutorReadV1 {
  getChainId(): Promise<number>;
  getCodeHash(address: Address): Promise<Hash | undefined>;
  riskManager(executor: Address): Promise<Address>;
  paused(riskManager: Address): Promise<boolean>;
  verifierSigner(riskManager: Address): Promise<Address>;
  walletAuthorized(riskManager: Address, owner: Address): Promise<boolean>;
  tokenEnabled(riskManager: Address, token: Address): Promise<boolean>;
  maxRoute(riskManager: Address, token: Address): Promise<bigint>;
}

export function createAgentExecutorReadV1(client: {
  getChainId(): Promise<number>;
  getCode(input: { address: Address }): Promise<Hex | undefined>;
  readContract(input: unknown): Promise<unknown>;
}): AgentExecutorReadV1 {
  const read = (address: Address, functionName: string, args: readonly Address[] = []) =>
    client.readContract({ address, abi: functionName === "riskManager" ? EXECUTOR_ABI : RISK_ABI, functionName, args });
  return {
    getChainId: () => client.getChainId(),
    getCodeHash: async (address) => {
      const code = await client.getCode({ address });
      return !code || code === "0x" ? undefined : keccak256(code);
    },
    riskManager: (executor) => read(executor, "riskManager") as Promise<Address>,
    paused: (risk) => read(risk, "paused") as Promise<boolean>,
    verifierSigner: (risk) => read(risk, "verifierSigner") as Promise<Address>,
    walletAuthorized: (risk, owner) => read(risk, "isWalletAuthorized", [owner]) as Promise<boolean>,
    tokenEnabled: (risk, token) => read(risk, "tokenEnabled", [token]) as Promise<boolean>,
    maxRoute: async (risk, token) => {
      const limits = await read(risk, "tokenLimits", [token]) as readonly bigint[];
      return limits[0]!;
    },
  };
}

export async function assertAgentExecutorReadyV1(input: {
  executor: Address;
  expectedCodeHash: Hash;
  expectedVerifier: Address;
  owner: Address;
  inputToken: Address;
  inputAmount: bigint;
  read: AgentExecutorReadV1;
}): Promise<void> {
  if (await input.read.getChainId() !== 196) throw new Error("Execution RPC is not X Layer mainnet");
  if (await input.read.getCodeHash(input.executor) !== input.expectedCodeHash) {
    throw new Error("Atomic executor code identity is not configured");
  }
  const risk = await input.read.riskManager(input.executor);
  const [paused, verifier, wallet, token, maxRoute] = await Promise.all([
    input.read.paused(risk),
    input.read.verifierSigner(risk),
    input.read.walletAuthorized(risk, input.owner),
    input.read.tokenEnabled(risk, input.inputToken),
    input.read.maxRoute(risk, input.inputToken),
  ]);
  if (paused) throw new Error("Atomic execution is paused");
  if (!isAddressEqual(verifier, input.expectedVerifier)) throw new Error("Verifier signer is not active");
  if (!wallet) throw new Error("Owner wallet is not authorized by the risk manager");
  if (!token) throw new Error("Input token is not enabled by the risk manager");
  if (input.inputAmount > maxRoute) throw new Error("Input exceeds the active per-route cap");
}
