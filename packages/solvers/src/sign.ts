import {
  commitment,
  DecisionBundleSchema,
  type DecisionBundle,
} from "@cobia/domain";
import type { LocalAccount } from "viem";

type UnsignedBundle = Omit<DecisionBundle, "signature">;

export async function signBundle(
  bundle: UnsignedBundle,
  account: LocalAccount,
): Promise<DecisionBundle> {
  const signature = await account.signMessage({
    message: { raw: commitment(bundle) },
  });

  return DecisionBundleSchema.parse({ ...bundle, signature });
}
