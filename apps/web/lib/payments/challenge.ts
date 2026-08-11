import { Challenge } from "@okxweb3/mpp";
import { chargeSchema } from "@okxweb3/mpp/evm";
import {
  getAddress,
  isAddress,
  isAddressEqual,
  type Address,
} from "viem";
import {
  PaymentTermsSchema,
  paymentTermsToChargeOptions,
  type PaymentTerms,
} from "./terms";

export interface ExpectedPaymentAuthorization {
  terms: PaymentTerms;
  owner: Address;
}

function requireAddressEqual(actual: string, expected: Address, field: string): Address {
  if (!isAddress(actual) || !isAddressEqual(actual, expected)) {
    throw new Error(`Payment challenge ${field} does not match expected terms`);
  }
  return getAddress(actual);
}

function requireEqual(actual: unknown, expected: unknown, field: string): void {
  if (actual !== expected) {
    throw new Error(`Payment challenge ${field} does not match expected terms`);
  }
}

export function validatePaymentChallenge(
  response: Response,
  expectedInput: ExpectedPaymentAuthorization,
  nowSec: number,
) {
  const terms = PaymentTermsSchema.parse(expectedInput.terms);
  const owner = getAddress(expectedInput.owner);
  const expected = paymentTermsToChargeOptions(terms);
  const challenge = Challenge.fromResponse(response);

  requireEqual(challenge.method, "evm", "method");
  requireEqual(challenge.intent, "charge", "intent");
  requireEqual(challenge.realm, terms.realm, "realm");
  requireEqual(challenge.description, expected.description, "description");
  requireEqual(challenge.expires, expected.expires, "expiry");
  if (terms.expiresAt <= nowSec) throw new Error("The payment challenge has expired");

  const payment = chargeSchema.schema.request.parse(challenge.request);
  requireEqual(payment.amount, terms.amount, "amount");
  const currency = requireAddressEqual(payment.currency, terms.currency, "currency");
  const recipient = requireAddressEqual(payment.recipient, terms.recipient, "recipient");
  requireEqual(payment.externalId, terms.externalId, "externalId");
  requireEqual(payment.methodDetails.chainId, terms.paymentChainId, "chainId");
  requireEqual(payment.methodDetails.feePayer, true, "feePayer");
  if (payment.methodDetails.permit2Address !== undefined) {
    throw new Error("Payment challenge must not request Permit2");
  }

  const splits = payment.methodDetails.splits ?? [];
  requireEqual(splits.length, terms.splits.length, "split count");
  const normalizedSplits = splits.map((split, index) => {
    const expectedSplit = terms.splits[index];
    if (!expectedSplit) throw new Error("Payment challenge contains an unexpected split");
    requireEqual(split.amount, expectedSplit.amount, `split ${index} amount`);
    const splitRecipient = requireAddressEqual(
      split.recipient,
      expectedSplit.recipient,
      `split ${index} recipient`,
    );
    requireEqual(split.memo, expectedSplit.memo, `split ${index} memo`);
    return { ...split, recipient: splitRecipient };
  });

  const splitTotal = normalizedSplits.reduce(
    (total, split) => total + BigInt(split.amount),
    0n,
  );
  const recipientAmount = BigInt(payment.amount) - splitTotal;
  if (recipientAmount <= 0n) throw new Error("The payment split consumes the full charge");

  return {
    challenge,
    terms,
    owner,
    currency,
    recipient,
    splits: normalizedSplits,
    recipientAmount: recipientAmount.toString(),
  };
}
