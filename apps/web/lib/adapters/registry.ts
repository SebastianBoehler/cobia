import { commitment, ROUTE_ADAPTER_IDS } from "@cobia/domain";
import type { Address, Hash } from "viem";
import { USDT_ADDRESS } from "../chain/supported-assets";
import {
  AAVE_V3_POOL,
  USDT_A_TOKEN,
  USDG_ADDRESS,
  USDG_A_TOKEN,
} from "../chain/xlayer";

export interface PinnedDeployment {
  address: Address;
  runtimeCodeHash: Hash;
  implementation?: {
    address: Address;
    runtimeCodeHash: Hash;
  };
}

const [AAVE_ADAPTER_ID, UNISWAP_ADAPTER_ID] = ROUTE_ADAPTER_IDS;

// Official deployment sources:
// https://github.com/aave-dao/aave-address-book/blob/70e2f303fe93616784148d6827df6644e5dda4db/src/AaveV3XLayer.sol
// https://developers.uniswap.org/docs/protocols/v3/deployments/v3-xlayer-deployments
// Runtime bytecode was independently hashed from X Layer at block 67,649,362.
export const PROTOCOL_REGISTRY = {
  version: 1,
  chainId: 196,
  auditedAtBlock: {
    number: "67649362",
    hash: "0x389aab5c989acb3e633dbf96f8fab038757bee9919142ba983d4bd195eb64b5a",
    timestamp: "1786418398",
  },
  aaveV3: {
    adapterId: AAVE_ADAPTER_ID,
    addressesProvider: {
      address: "0xdFf435BCcf782f11187D3a4454d96702eD78e092",
      runtimeCodeHash: "0x35aab86c167b0d508bc2b8fe879cab12f92c222e8dee2e0c3244ffbb12533df0",
    },
    pool: {
      address: AAVE_V3_POOL,
      runtimeCodeHash: "0xade071cf93d723c0a6c61715d4d162c611d10fc9c6a6e785c7475af8d10c36fd",
      implementation: {
        address: "0x5Bc7204274230a8F4778a35A58B776D16CF104b4",
        runtimeCodeHash: "0x72c24c2d36fa591ee8429f17ce90c5cc1dcee55078dc5335b7959ea4ebb582a7",
      },
    },
    dataProvider: {
      address: "0x6C505C31714f14e8af2A03633EB2Cdfb4959138F",
      runtimeCodeHash: "0xedb769fc8d3f7fb759ef8aa755c403d933c09f6577fd59db39a8e650ee7b9306",
    },
    oracle: {
      address: "0x91FC11136d5615575a0fC5981Ab5C0C54418E2C6",
      runtimeCodeHash: "0x62cd207177ac71a4095f211e62bbb251e000b80f94d0e180daa0e23e4ba086b1",
    },
    assets: {
      USDG: {
        underlying: {
          address: USDG_ADDRESS,
          runtimeCodeHash: "0x5e4dcb0bb1910f6429e5fe91678990088a51c6d1cfe1b31d05fb9d948cc7867c",
          implementation: {
            address: "0x50607322Caa9CE5C27B8Cc403C476838CAAa9202",
            runtimeCodeHash: "0x1817911a4edde54a1ec32fdc3d5b354670520e839ad7bf53575b872b36db1cb4",
          },
        },
        aToken: {
          address: USDG_A_TOKEN,
          runtimeCodeHash: "0x030903f532c677dfaee1e276ce63f7abbc5b9a6096e0caabb5187c909cddd137",
          implementation: {
            address: "0x384c8C9e2A201975b2ef3415b96d2204826034ae",
            runtimeCodeHash: "0x4e7a8a4f2535ede57001fd4e43172eaffe01b5b75bdefd81aa7b4a512d1e3dbd",
          },
        },
        decimals: 6,
      },
      USDt0: {
        underlying: {
          address: USDT_ADDRESS,
          runtimeCodeHash: "0x4d9be648c5bf39973670d9f8b481d5d0b971e6a2db2deccc6b98cde21c5dd83e",
          implementation: {
            address: "0x1EC7df9e74bE05cb5A456ACa2DC1AC2CeC9AB6A3",
            runtimeCodeHash: "0x61466328a9d17e782f4a37d32db189f981ce32e45de6a4668c3f7bb1cd8d49ae",
          },
        },
        aToken: {
          address: USDT_A_TOKEN,
          runtimeCodeHash: "0x030903f532c677dfaee1e276ce63f7abbc5b9a6096e0caabb5187c909cddd137",
          implementation: {
            address: "0x384c8C9e2A201975b2ef3415b96d2204826034ae",
            runtimeCodeHash: "0x4e7a8a4f2535ede57001fd4e43172eaffe01b5b75bdefd81aa7b4a512d1e3dbd",
          },
        },
        decimals: 6,
      },
    },
  },
  uniswapV3: {
    adapterId: UNISWAP_ADAPTER_ID,
    factory: {
      address: "0x4B2ab38DBF28D31D467aA8993f6c2585981D6804",
      runtimeCodeHash: "0x98cde3564f540d7529feb2c697e2d79b85e3bc864d088ebe09fd5dcfc60a5c0e",
    },
    quoterV2: {
      address: "0xD1b797D92d87B688193A2B976eFc8D577D204343",
      runtimeCodeHash: "0xfd872b486699c79a91db9b977e6e271edfed3535fb624a6973bb05d6dac2a277",
    },
    swapRouter02: {
      address: "0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA",
      runtimeCodeHash: "0x83ee2f04768ca84e762b139bf36844bf7efbd75b3c7cc898705169eacb9d5102",
    },
    nonfungiblePositionManager: {
      address: "0x315e413A11AB0df498eF83873012430ca36638Ae",
      runtimeCodeHash: "0xd8339465f5c45afef4319fde20bb35cb5c5e17cf861c73b669d07ca615e3213c",
    },
    pair: {
      pool: {
        address: "0x0cBe0dBE1400e57f371a38BD3b9bC80F7C3676dA",
        runtimeCodeHash: "0x3bcd8365275438d68771a8164c5aef769ca3693921498cdd1e85f91736fea73a",
      },
      token0: "USDG",
      token1: "USDt0",
      fee: 100,
    },
  },
} as const;

export type RegistryAsset = keyof typeof PROTOCOL_REGISTRY.aaveV3.assets;
export const registryHash = commitment(PROTOCOL_REGISTRY);
