import { isAddress, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";

const UINT256_MAX = (1n << 256n) - 1n;
const INT256_MIN = -(1n << 255n);
const INT256_MAX = (1n << 255n) - 1n;

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
);
const CalldataSchema = z.string()
  .regex(/^0x(?:[0-9a-fA-F]{2}){4,2048}$/)
  .transform((value) => value.toLowerCase() as Hex);

export const StaticReadV1Schema = z.object({
  target: AddressSchema,
  runtimeCodeHash: HashSchema.refine((value) => !/^0x0{64}$/.test(value)),
  data: CalldataSchema.refine((value) => value.slice(0, 10) !== "0x00000000"),
  returnWordIndex: z.number().int().min(0).max(127),
  decodeType: z.enum(["uint256", "int256", "address", "bool", "bytes32"]),
  gasLimit: z.number().int().min(5_000).max(250_000),
  label: z.string().trim().min(1).max(128),
}).strict();

export type StaticReadV1 = z.infer<typeof StaticReadV1Schema>;

function canonicalInteger(value: string, signed: boolean): boolean {
  if (!(signed ? /^-?(0|[1-9][0-9]*)$/ : /^(0|[1-9][0-9]*)$/).test(value) || value === "-0") {
    return false;
  }
  const parsed = BigInt(value);
  return signed ? parsed >= INT256_MIN && parsed <= INT256_MAX : parsed <= UINT256_MAX;
}

export const StaticPredicateV1Schema = StaticReadV1Schema.extend({
  phase: z.enum(["before", "after"]),
  comparator: z.enum(["eq", "gte", "lte"]),
  bound: z.string().min(1).max(128),
}).strict().superRefine((value, context) => {
  const ordered = value.comparator !== "eq";
  if (ordered && value.decodeType !== "uint256" && value.decodeType !== "int256") {
    context.addIssue({ code: "custom", path: ["comparator"], message: "Ordered comparison requires a numeric read" });
  }
  const valid = value.decodeType === "uint256"
    ? canonicalInteger(value.bound, false)
    : value.decodeType === "int256"
      ? canonicalInteger(value.bound, true)
      : value.decodeType === "address"
        ? isAddress(value.bound)
        : value.decodeType === "bool"
          ? value.bound === "true" || value.bound === "false"
          : /^0x[0-9a-fA-F]{64}$/.test(value.bound);
  if (!valid) context.addIssue({ code: "custom", path: ["bound"], message: "Predicate bound does not match its primitive" });
}).transform((value) => ({
  ...value,
  bound: value.decodeType === "address" || value.decodeType === "bytes32"
    ? value.bound.toLowerCase()
    : value.bound,
}));

export type StaticPredicateV1 = z.infer<typeof StaticPredicateV1Schema>;

export const NumericStaticReadV1Schema = StaticReadV1Schema.refine(
  (value) => value.decodeType === "uint256" || value.decodeType === "int256",
  { message: "Optimization requires a numeric read" },
);
