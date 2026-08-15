import {
  getAddress,
  isHex,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

interface SafeBatchTransaction {
  to: Address;
  value: string;
  data: Hex;
}

interface SafeBatchFile {
  version: "1.0";
  chainId: string;
  createdAt: number;
  meta: {
    name: string;
    description?: string;
    txBuilderVersion?: string;
    checksum?: Hex | "";
    createdFromSafeAddress?: Address;
    createdFromOwnerAddress?: Address | "";
  };
  transactions: SafeBatchTransaction[];
}

type JsonValue = string | number | boolean | null | JsonValue[] | {
  [key: string]: JsonValue | undefined;
};

function serialize(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value).sort();
    const values = keys.map((key) => `${serialize(value[key] ?? null)},`).join("");
    return `{${JSON.stringify(keys)}${values}}`;
  }
  return JSON.stringify(value);
}

/** Applies the checksum algorithm used by Safe Transaction Builder 2.1.0. */
export function addSafeBatchChecksum(batch: SafeBatchFile): SafeBatchFile {
  const { checksum: _checksum, ...meta } = batch.meta;
  const serialized = serialize({
    ...batch,
    meta: { ...meta, name: null },
  } as unknown as JsonValue);
  return {
    ...batch,
    meta: { ...batch.meta, checksum: keccak256(stringToHex(serialized)) },
  };
}

export function buildSafeBatch(input: {
  safe: Address;
  name: string;
  description: string;
  createdAt: number;
  transactions: readonly { to: Address; value: Hex; data: Hex }[];
}): SafeBatchFile {
  if (!input.name.trim() || !input.description.trim() ||
    !Number.isSafeInteger(input.createdAt) || input.createdAt <= 0 ||
    input.transactions.length === 0) {
    throw new Error("Safe batch metadata is invalid");
  }
  const transactions = input.transactions.map((transaction) => {
    if (!isHex(transaction.data) || transaction.data === "0x") {
      throw new Error("Safe batch calldata is invalid");
    }
    return {
      to: getAddress(transaction.to),
      value: BigInt(transaction.value).toString(),
      data: transaction.data,
    };
  });
  return addSafeBatchChecksum({
    version: "1.0",
    chainId: "196",
    createdAt: input.createdAt,
    meta: {
      name: input.name,
      description: input.description,
      txBuilderVersion: "2.1.0",
      createdFromSafeAddress: getAddress(input.safe),
      createdFromOwnerAddress: "",
    },
    transactions,
  });
}
