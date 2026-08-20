import { Challenge } from "@okxweb3/mpp";
import { commitment } from "@cobia/domain";
import type { Address } from "viem";
import { validatePaymentCredential } from "./credential";
import { buildPaymentTerms, paymentTermsToChargeOptions } from "./terms";

export const SOLVER_SUCCESS_FEE_ATOMIC = "100000" as const;

export function buildSolverSuccessFeeTerms(input: {
  submissionId: string; solverId: string; owner: Address; recipient: Address;
  treasury: Address; realm: string; nowSec: number; deadline: number;
}) {
  const externalId = commitment({ version: 1, kind: "solver-success-fee",
    submissionId: input.submissionId, solverId: input.solverId,
    owner: input.owner.toLowerCase(), recipient: input.recipient.toLowerCase() });
  return buildPaymentTerms({
    quote: { quoteId: externalId, priceAtomic: SOLVER_SUCCESS_FEE_ATOMIC },
    solver: input.recipient,
    treasury: input.treasury,
    realm: input.realm,
    issuedAt: input.nowSec,
    cutoff: Math.min(input.deadline, input.nowSec + 300),
  });
}

export function solverSuccessFeeChallenge(terms: ReturnType<typeof buildSolverSuccessFeeTerms>) {
  const options = paymentTermsToChargeOptions(terms);
  return {
    id: `success-${terms.externalId.slice(2, 34)}`,
    realm: terms.realm,
    method: "evm" as const,
    intent: "charge" as const,
    description: options.description,
    expires: options.expires,
    request: { amount: options.amount, currency: options.currency,
      recipient: options.recipient, externalId: options.externalId,
      methodDetails: options.methodDetails },
  };
}

export function solverSuccessFeeRequiredResponse(
  terms: ReturnType<typeof buildSolverSuccessFeeTerms>,
) {
  return Response.json({ code: "SOLVER_SUCCESS_FEE_REQUIRED",
    message: "Authorize the capped 0.10 USDt0 fee. It settles only after confirmed execution.",
    terms }, { status: 402, headers: {
      "WWW-Authenticate": Challenge.serialize(solverSuccessFeeChallenge(terms)),
      "Cache-Control": "no-store",
    } });
}

export async function parseSolverSuccessFeeCredential(input: {
  request: Request; terms: ReturnType<typeof buildSolverSuccessFeeTerms>;
  owner: Address; nowSec: number;
}) {
  const validated = await validatePaymentCredential(input.request,
    { terms: input.terms, owner: input.owner }, input.nowSec);
  const credential = JSON.parse(JSON.stringify(validated.credential)) as unknown;
  return { credential, credentialHash: commitment(credential),
    termsHash: commitment(input.terms), authorization: validated.authorization };
}
