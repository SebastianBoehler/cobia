import { Attribution } from "ox/erc8021";
import { concatHex, type Hex } from "viem";

export const COBIA_XLAYER_BUILDER_CODE = "sq6dlj2onr8ml5xa";

export const COBIA_XLAYER_DATA_SUFFIX = Attribution.toDataSuffix({
  codes: [COBIA_XLAYER_BUILDER_CODE],
});

export function attributeCobiaTransaction<T extends { data: Hex }>(transaction: T): T {
  return {
    ...transaction,
    data: concatHex([transaction.data, COBIA_XLAYER_DATA_SUFFIX]),
  };
}
