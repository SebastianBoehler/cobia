import { commitment } from "@cobia/domain";
import { isAddressEqual, type Hash } from "viem";
import { RwaInstrumentV1Schema, type RwaInstrumentV1 } from "./types";

type Query = {
  chainId: number;
  token: string;
  jurisdiction: string;
  nowSec: number;
};

export class InstrumentRegistryError extends Error {
  constructor(public readonly code:
    | "INSTRUMENT_NOT_REGISTERED"
    | "INSTRUMENT_JURISDICTION_UNSUPPORTED"
    | "INSTRUMENT_EVIDENCE_STALE") {
    super(code);
    this.name = "InstrumentRegistryError";
  }
}

function identity({ chainId, token }: Pick<RwaInstrumentV1, "chainId" | "token">): string {
  return `${chainId}:${token}`;
}

export function createInstrumentRegistryV1(entries: readonly unknown[]): readonly RwaInstrumentV1[] {
  const parsed = entries.map((entry) => RwaInstrumentV1Schema.parse(entry));
  const identities = parsed.map(identity);
  if (new Set(identities).size !== identities.length) throw new Error("Duplicate instrument identity");
  return Object.freeze(parsed.map((entry) => Object.freeze(entry)));
}

const PRODUCTION_REGISTRY = createInstrumentRegistryV1([
  {
    version: 1, chainId: 196, token: "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0",
    displayName: "Tesla xStock", symbol: "TSLAx", platform: "xStocks",
    issuer: "Backed Assets (JE) Limited", underlyingIdentifier: "US88160R1014",
    claimClass: "debt-claim", eligibleJurisdictions: ["DE"],
    eligibilityNote: "Available only to eligible non-restricted users. Issuer, platform, geographic, and local-law restrictions apply; this token provides price exposure without Tesla shareholder rights.",
    acquisitionProvider: "xstocks@1",
    restrictionsHash: "0x51ddf5df94529310ce048a78caf77e379f23e801af3adb67d3a3445d316f0c6b",
    runtimeCodeHash: "0xe7cbfea5a664672738dd729f7774677b0fa82dbdda74320df20eec49d2211b4c",
    implementationCodeHash: "0x867df49d5c7ab1198b64f29e6be9b2c1be8482d35a59b38d0f9e243be448ae68",
    officialSources: [
      { url: "https://api.xstocks.fi/api/v2/public/assets/TSLAx",
        contentHash: "0x1bbb1b62b8fc455017cf33df95f19e78174b7f9d5e27c55004168927696261fc" },
      { url: "https://assets.backed.fi/products/tesla-xstock",
        contentHash: "0x3fa4eae577719df8abb1a056ba56d9962b79fddcb1bcb1478bb7d8fb168e7972" },
      { url: "https://xstocks.com/partner",
        contentHash: "0x51ddf5df94529310ce048a78caf77e379f23e801af3adb67d3a3445d316f0c6b" },
    ],
    evidenceExpiresAt: 1_789_830_572,
  },
  {
    version: 1, chainId: 1, token: "0x45804880de22913dafe09f4980848ece6ecbaf78",
    displayName: "Pax Gold", symbol: "PAXG", platform: "Paxos",
    issuer: "Paxos Trust Company, N.A.", underlyingIdentifier: "LBMA-ALLOCATED-GOLD",
    claimClass: "beneficial-interest", eligibleJurisdictions: ["CH", "GB", "US"],
    eligibilityNote: "Paxos terms and local law apply. PAXG is currently unavailable in the EU.",
    acquisitionProvider: "lifi@1",
    restrictionsHash: "0x9e9bfeb59a537c43866e26488d8038ad808d8cbdd4e6357ec753a7257cc918fb",
    runtimeCodeHash: "0xdcdc97bea5436354845afab66a9dc621e9ebe642db18e81a95c66b770f60bb3d",
    implementationCodeHash: "0xdcdc97bea5436354845afab66a9dc621e9ebe642db18e81a95c66b770f60bb3d",
    officialSources: [{ url: "https://www.paxos.com/pax-gold",
      contentHash: "0x9e9bfeb59a537c43866e26488d8038ad808d8cbdd4e6357ec753a7257cc918fb" }],
    evidenceExpiresAt: 1_789_830_572,
  },
  {
    version: 1, chainId: 1, token: "0x1b19c19393e2d034d8ff31ff34c81252fcbbee92",
    displayName: "Ondo Short-Term US Government Treasuries", symbol: "OUSG", platform: "Ondo Finance",
    issuer: "Ondo I LP", underlyingIdentifier: "OUSG-FUND-SHARE",
    claimClass: "fund-share", eligibleJurisdictions: ["US"],
    eligibilityNote: "Only eligible accredited investors and qualified purchasers may hold OUSG.",
    acquisitionProvider: "lifi@1",
    restrictionsHash: "0xe2b8d41ee33c103e9492d8e67af491bdd2c3bc178014b7f9910220d26bdb971f",
    runtimeCodeHash: "0xa23b20d4f9e75f4bf9bd74d8c1b7f0219547289c67a11dea65370c1810fc1387",
    implementationCodeHash: "0xe3966d923815cfd861c8d73e35fa571de9439704c40ec2341f867ede467fbbdf",
    officialSources: [{ url: "https://docs.ondo.finance/addresses",
      contentHash: "0xe2b8d41ee33c103e9492d8e67af491bdd2c3bc178014b7f9910220d26bdb971f" }],
    evidenceExpiresAt: 1_789_830_572,
  },
  {
    version: 1, chainId: 1, token: "0x96f6ef951840721adbf46ac996b59e0235cb985c",
    displayName: "Ondo US Dollar Yield", symbol: "USDY", platform: "Ondo Finance",
    issuer: "Ondo Global Markets (BVI) Limited", underlyingIdentifier: "USDY-DEBT-OBLIGATION",
    claimClass: "debt-claim", eligibleJurisdictions: ["CH", "DE", "GB"],
    eligibilityNote: "Non-US access is restricted; EEA users must independently meet professional-investor requirements.",
    acquisitionProvider: "lifi@1",
    restrictionsHash: "0x647afa078a4d99917acd8c6866ee58516cc18581f8bcc160e4733e63e89ec14c",
    runtimeCodeHash: "0xa23b20d4f9e75f4bf9bd74d8c1b7f0219547289c67a11dea65370c1810fc1387",
    implementationCodeHash: "0x8f5e4d087ec40f0ce649c01bf65465091aac7c8268c89b9556def5e244c9c145",
    officialSources: [{ url: "https://docs.ondo.finance/developer-guides/usdy-instant-manager-integration",
      contentHash: "0x647afa078a4d99917acd8c6866ee58516cc18581f8bcc160e4733e63e89ec14c" }],
    evidenceExpiresAt: 1_789_830_572,
  },
]);

export function productionInstrumentRegistryV1(): readonly RwaInstrumentV1[] {
  return PRODUCTION_REGISTRY;
}

export function resolveInstrumentFromRegistryV1(
  registry: readonly RwaInstrumentV1[],
  query: Query,
): RwaInstrumentV1 {
  const found = registry.find((entry) => entry.chainId === query.chainId &&
    isAddressEqual(entry.token as `0x${string}`, query.token as `0x${string}`));
  if (!found) throw new InstrumentRegistryError("INSTRUMENT_NOT_REGISTERED");
  if (!found.eligibleJurisdictions.includes(query.jurisdiction)) {
    throw new InstrumentRegistryError("INSTRUMENT_JURISDICTION_UNSUPPORTED");
  }
  if (found.evidenceExpiresAt <= query.nowSec) {
    throw new InstrumentRegistryError("INSTRUMENT_EVIDENCE_STALE");
  }
  return found;
}

export function resolveInstrumentV1(query: Query): RwaInstrumentV1 {
  return resolveInstrumentFromRegistryV1(PRODUCTION_REGISTRY, query);
}

export function instrumentCommitmentV1(instrument: RwaInstrumentV1): Hash {
  return commitment(RwaInstrumentV1Schema.parse(instrument)) as Hash;
}

export { RwaInstrumentV1Schema } from "./types";
