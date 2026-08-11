import type { Address, Hash, Hex } from "viem";

export const BLOCK_REFERENCE = {
  number: 67_649_362n,
  hash: "0x389aab5c989acb3e633dbf96f8fab038757bee9919142ba983d4bd195eb64b5a",
  timestamp: 1_786_418_398n,
} as const;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

export const ADDRESSES = {
  aaveProvider: "0xdFf435BCcf782f11187D3a4454d96702eD78e092",
  aavePool: "0xE3F3Caefdd7180F884c01E57f65Df979Af84f116",
  aavePoolImpl: "0x5Bc7204274230a8F4778a35A58B776D16CF104b4",
  aaveDataProvider: "0x6C505C31714f14e8af2A03633EB2Cdfb4959138F",
  aaveOracle: "0x91FC11136d5615575a0fC5981Ab5C0C54418E2C6",
  usdg: "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8",
  usdgImpl: "0x50607322Caa9CE5C27B8Cc403C476838CAAa9202",
  aUsdg: "0x228765a3C18065C923F23a0CCb6c7cEFB3eA2223",
  aTokenImpl: "0x384c8C9e2A201975b2ef3415b96d2204826034ae",
  usdt0: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
  usdt0Impl: "0x1EC7df9e74bE05cb5A456ACa2DC1AC2CeC9AB6A3",
  aUsdt0: "0xF356ae412dB5df43BD3a10746f7ad4e1C4De4297",
  uniFactory: "0x4B2ab38DBF28D31D467aA8993f6c2585981D6804",
  uniQuoter: "0xD1b797D92d87B688193A2B976eFc8D577D204343",
  uniRouter: "0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA",
  uniPositionManager: "0x315e413A11AB0df498eF83873012430ca36638Ae",
  uniPool: "0x0cBe0dBE1400e57f371a38BD3b9bC80F7C3676dA",
  curveFactory: "0x5eeE3091f747E60a045a2E715a4c71e600e31F6E",
  curveViews: "0x506F594ceb4E33F5161139bAe3Ee911014df9f7f",
  curvePlainImplementation: "0x87FE17697D0f14A222e8bEf386a0860eCffDD617",
  curvePool: "0x31F066aA0A687d4F383F96a514984AF727Eb8e38",
} as const satisfies Record<string, Address>;

export const CODE_HASHES = {
  aaveProvider: "0x35aab86c167b0d508bc2b8fe879cab12f92c222e8dee2e0c3244ffbb12533df0",
  aavePool: "0xade071cf93d723c0a6c61715d4d162c611d10fc9c6a6e785c7475af8d10c36fd",
  aavePoolImpl: "0x72c24c2d36fa591ee8429f17ce90c5cc1dcee55078dc5335b7959ea4ebb582a7",
  aaveDataProvider: "0xedb769fc8d3f7fb759ef8aa755c403d933c09f6577fd59db39a8e650ee7b9306",
  aaveOracle: "0x62cd207177ac71a4095f211e62bbb251e000b80f94d0e180daa0e23e4ba086b1",
  usdg: "0x5e4dcb0bb1910f6429e5fe91678990088a51c6d1cfe1b31d05fb9d948cc7867c",
  usdgImpl: "0x1817911a4edde54a1ec32fdc3d5b354670520e839ad7bf53575b872b36db1cb4",
  aUsdg: "0x030903f532c677dfaee1e276ce63f7abbc5b9a6096e0caabb5187c909cddd137",
  aTokenImpl: "0x4e7a8a4f2535ede57001fd4e43172eaffe01b5b75bdefd81aa7b4a512d1e3dbd",
  usdt0: "0x4d9be648c5bf39973670d9f8b481d5d0b971e6a2db2deccc6b98cde21c5dd83e",
  usdt0Impl: "0x61466328a9d17e782f4a37d32db189f981ce32e45de6a4668c3f7bb1cd8d49ae",
  aUsdt0: "0x030903f532c677dfaee1e276ce63f7abbc5b9a6096e0caabb5187c909cddd137",
  uniFactory: "0x98cde3564f540d7529feb2c697e2d79b85e3bc864d088ebe09fd5dcfc60a5c0e",
  uniQuoter: "0xfd872b486699c79a91db9b977e6e271edfed3535fb624a6973bb05d6dac2a277",
  uniRouter: "0x83ee2f04768ca84e762b139bf36844bf7efbd75b3c7cc898705169eacb9d5102",
  uniPositionManager: "0xd8339465f5c45afef4319fde20bb35cb5c5e17cf861c73b669d07ca615e3213c",
  uniPool: "0x3bcd8365275438d68771a8164c5aef769ca3693921498cdd1e85f91736fea73a",
  curveFactory: "0xa2360ff48b83e8eeb4a633f8f4c268a62c4f23c0d2da5b673423a2b58e7a78d2",
  curveViews: "0x34e327c9d8557aa0ef913c8972a44be8e21de2d829fcacb10237ccf8330df954",
  curvePlainImplementation: "0xb7283520ec579d21cbcb603d7da789bccc5a7b1f48fe858af4ffd7dde9b16bc0",
  curvePool: "0x855800c63268949eadd5206e5729c69e768f017722f275e90c4185b1fb0733bc",
} as const satisfies Record<keyof typeof ADDRESSES, Hash>;

const PROXY_IMPLEMENTATIONS = new Map<string, Address>([
  [ADDRESSES.aavePool.toLowerCase(), ADDRESSES.aavePoolImpl],
  [ADDRESSES.usdg.toLowerCase(), ADDRESSES.usdgImpl],
  [ADDRESSES.aUsdg.toLowerCase(), ADDRESSES.aTokenImpl],
  [ADDRESSES.usdt0.toLowerCase(), ADDRESSES.usdt0Impl],
  [ADDRESSES.aUsdt0.toLowerCase(), ADDRESSES.aTokenImpl],
]);

export function implementationWord(address: Address): Hex {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

function contractKey(address: Address, functionName: string, args: readonly unknown[] = []) {
  return `${address.toLowerCase()}:${functionName}:${JSON.stringify(args, (_, value) =>
    typeof value === "bigint" ? value.toString() : value)}`;
}

function blockContractKey(
  blockNumber: bigint,
  address: Address,
  functionName: string,
  args: readonly unknown[] = [],
) {
  return `${blockNumber}:${contractKey(address, functionName, args)}`;
}

export class ReaderTestClient {
  readonly codeHashes = new Map<string, Hash>();
  readonly implementationSlots = new Map<string, Hex>();
  readonly blocks: Array<{ number: bigint; hash: Hash; timestamp: bigint }> = [
    { ...BLOCK_REFERENCE },
    { ...BLOCK_REFERENCE },
  ];
  private readonly responses = new Map<string, unknown>();
  private readonly additionalBlocks = new Map<bigint, {
    number: bigint;
    hash: Hash;
    timestamp: bigint;
  }>();
  private blockReadIndex = 0;
  chainId = 196;

  constructor(readonly expectedBlockNumber = BLOCK_REFERENCE.number) {
    for (const key of Object.keys(ADDRESSES) as Array<keyof typeof ADDRESSES>) {
      this.codeHashes.set(ADDRESSES[key].toLowerCase(), CODE_HASHES[key]);
    }
    for (const [proxy, implementation] of PROXY_IMPLEMENTATIONS) {
      this.implementationSlots.set(proxy, implementationWord(implementation));
    }
  }

  respond(address: Address, functionName: string, args: readonly unknown[], result: unknown) {
    this.responses.set(contractKey(address, functionName, args), result);
  }

  respondAt(
    blockNumber: bigint,
    address: Address,
    functionName: string,
    args: readonly unknown[],
    result: unknown,
  ) {
    this.responses.set(blockContractKey(blockNumber, address, functionName, args), result);
  }

  addBlock(block: { number: bigint; hash: Hash; timestamp: bigint }) {
    this.additionalBlocks.set(block.number, block);
  }

  async getBlock({ blockNumber }: { blockNumber: bigint }) {
    if (blockNumber !== this.expectedBlockNumber) {
      const block = this.additionalBlocks.get(blockNumber);
      if (!block) throw new Error("reader did not pin block read");
      return block;
    }
    return this.blocks[Math.min(this.blockReadIndex++, this.blocks.length - 1)];
  }

  async getStorageAt(request: { address: Address; slot: Hex; blockNumber: bigint }) {
    if (request.blockNumber !== this.expectedBlockNumber || request.slot !== IMPLEMENTATION_SLOT) {
      throw new Error("reader did not pin implementation-slot read");
    }
    return this.implementationSlots.get(request.address.toLowerCase());
  }

  async getRuntimeCodeHash({ address, blockNumber }: { address: Address; blockNumber: bigint }) {
    if (blockNumber !== this.expectedBlockNumber && !this.additionalBlocks.has(blockNumber)) {
      throw new Error("reader did not pin bytecode read");
    }
    return this.codeHashes.get(address.toLowerCase());
  }

  async getChainId() {
    return this.chainId;
  }

  async readContract(request: {
    address: Address;
    functionName: string;
    args?: readonly unknown[];
    blockNumber?: bigint;
  }) {
    if (request.blockNumber !== this.expectedBlockNumber &&
      !this.additionalBlocks.has(request.blockNumber ?? -1n)) {
      throw new Error("reader did not pin contract read");
    }
    const exactKey = blockContractKey(
      request.blockNumber!,
      request.address,
      request.functionName,
      request.args,
    );
    if (this.responses.has(exactKey)) return this.responses.get(exactKey);
    const key = contractKey(request.address, request.functionName, request.args);
    if (!this.responses.has(key)) throw new Error(`unexpected contract read: ${key}`);
    return this.responses.get(key);
  }
}
