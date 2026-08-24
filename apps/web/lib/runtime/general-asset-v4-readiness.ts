import { isAddressEqual, keccak256, parseAbi,
  type Address, type Hash, type Hex } from "viem";

const READ_ABI = parseAbi([
  "function registry() view returns (address)",
  "function riskManager() view returns (address)",
  "function executor() view returns (address)",
  "function verifierSigner() view returns (address)",
  "function paused() view returns (bool)",
  "function accessMode() view returns (uint8)",
  "function limits() view returns (uint128 maxRouteUsdE8,uint128 maxWallet24hUsdE8,uint128 maxProtocol24hUsdE8)",
]);

interface Client {
  getCode(input: { address: Address; blockNumber: bigint }): Promise<Hex | undefined>;
  readContract(input: { address: Address; abi: typeof READ_ABI; functionName: string;
    args: readonly unknown[]; blockNumber: bigint }): Promise<unknown>;
}
interface Config {
  executor: Address; executorCodeHash: Hash; registry: Address; registryCodeHash: Hash;
  riskManager: Address; riskManagerCodeHash: Hash; protocolCapUsdE8: string;
}

function address(value: unknown, expected: Address): boolean {
  return typeof value === "string" && isAddressEqual(value as Address, expected);
}

export async function assertGeneralAssetV4Ready(input: { client: Client; config: Config;
  verifier: Address; target?: Address; selector?: Hex; blockNumber: string }) {
  const blockNumber = BigInt(input.blockNumber);
  const codeHash = async (target: Address) => {
    const code = await input.client.getCode({ address: target, blockNumber });
    return !code || code === "0x" ? undefined : keccak256(code);
  };
  const read = (target: Address, functionName: string, args: readonly unknown[] = []) =>
    input.client.readContract({ address: target, abi: READ_ABI, functionName, args, blockNumber });
  const [executorHash, registryHash, riskHash, registry, riskManager, riskExecutor,
    verifier, riskPaused, accessMode, limits] = await Promise.all([
    codeHash(input.config.executor), codeHash(input.config.registry), codeHash(input.config.riskManager),
    read(input.config.executor, "registry"), read(input.config.executor, "riskManager"),
    read(input.config.riskManager, "executor"), read(input.config.riskManager, "verifierSigner"),
    read(input.config.riskManager, "paused"), read(input.config.riskManager, "accessMode"),
    read(input.config.riskManager, "limits"),
  ]);
  const tuple = Array.isArray(limits) ? limits : [];
  if (executorHash !== input.config.executorCodeHash || registryHash !== input.config.registryCodeHash ||
      riskHash !== input.config.riskManagerCodeHash || !address(registry, input.config.registry) ||
      !address(riskManager, input.config.riskManager) || !address(riskExecutor, input.config.executor) ||
      !address(verifier, input.verifier) || riskPaused !== false || accessMode !== 1 ||
      tuple[0] !== 100_000_000_000n ||
      tuple[1] !== 500_000_000_000n || tuple[2] !== BigInt(input.config.protocolCapUsdE8)) {
    throw new Error("General asset V4 executor, risk manager, or registry is not public-ready");
  }
}
