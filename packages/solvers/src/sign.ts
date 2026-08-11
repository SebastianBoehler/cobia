import {
  commitment,
  DecisionBundleSchema,
  RouteBundleV2Schema,
  type DecisionBundle,
  type RouteBundleV2,
} from "@cobia/domain";
import { isAddressEqual, type LocalAccount } from "viem";

type UnsignedBundle = Omit<DecisionBundle, "signature">;
type UnsignedRouteBundleV2 = Omit<RouteBundleV2, "signature">;

export async function signBundle(
  bundle: UnsignedBundle,
  account: LocalAccount,
): Promise<DecisionBundle> {
  const signature = await account.signMessage({
    message: { raw: commitment(bundle) },
  });

  return DecisionBundleSchema.parse({ ...bundle, signature });
}

export async function signRouteBundleV2(
  input: UnsignedRouteBundleV2,
  account: LocalAccount,
): Promise<RouteBundleV2> {
  const unsigned = RouteBundleV2Schema.omit({ signature: true }).parse(input);
  if (!isAddressEqual(unsigned.solverAddress, account.address)) {
    throw new Error("Route bundle solver address does not match signer");
  }
  const signature = await account.signMessage({
    message: { raw: commitment(unsigned) },
  });
  return RouteBundleV2Schema.parse({ ...unsigned, signature });
}
