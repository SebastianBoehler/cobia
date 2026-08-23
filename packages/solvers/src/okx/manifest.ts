import { OkxVerifierManifestV1Schema } from "./wire";

export const XLAYER_OKX_MANIFEST_V1 = OkxVerifierManifestV1Schema.parse({
  version: 1,
  chainId: 196,
  router: {
    address: "0x722db4f285f8bd91ef7af6da397e83f7fa4e80a7",
    runtimeCodeHash: "0x38e02cc6683c3fff0758aefa8b75189fd541ce1623cc9e6139de3119185f2a7f",
    selectors: ["0x0c307f76"],
  },
  approval: {
    address: "0x8b773d83bc66be128c60e07e17c8901f7a64f000",
    runtimeCodeHash: "0x69c96ed2d046e83e322c31cbc8c0943dbad47bc7cc31d1f8760921c47b0d7671",
  },
  builderDataSuffix: "0x737136646c6a326f6e72386d6c357861100080218021802180218021802180218021",
});
