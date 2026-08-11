import { Challenge } from "@okxweb3/mpp";
import { commitment } from "@cobia/domain";
import { NextResponse } from "next/server";
import { isAddress, isAddressEqual, type Hash, type Hex } from "viem";
import { z } from "zod";
import { validatePurchasedRouteIntegrity } from "@/lib/db/purchased-route-artifact";
import { validatePaymentCredential } from "@/lib/payments/credential";
import { readPaymentConfig } from "@/lib/payments/config";
import {
  buildContextPaymentTerms,
  validateContextPaymentTerms,
  verifyCurrentExecutablePaymentContext,
  verifySettledRevealPaymentContext,
} from "@/lib/payments/payment-context";
import {
  RevealProofSchema,
  revealProofCommitment,
  verifyRevealProof,
  verifyRevealRecoveryProof,
} from "@/lib/payments/reveal-proof";
import {
  PaidRevealClientError,
  paidRevealClientError,
  paidRevealStep,
} from "@/lib/payments/reveal-error";
import { createPaymentServer } from "@/lib/payments/server";
import { hashPaymentTerms, paymentTermsToChargeOptions } from "@/lib/payments/terms";
import { getPaymentRepository, getRequestRepository } from "@/lib/runtime/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuoteIdSchema = z.string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as Hash);

const RevealRequestSchema = z.object({
  proof: RevealProofSchema,
  ownerSignature: z.string()
    .regex(/^0x[0-9a-fA-F]{130}$/)
    .transform((value) => value as Hex),
}).strict();

function purchasedRouteResponse(
  finalized: Awaited<ReturnType<ReturnType<typeof getPaymentRepository>["finalizePayment"]>>,
  context: Pick<
    Awaited<ReturnType<ReturnType<typeof getRequestRepository>["getPaymentContext"]>>,
    "policy" | "snapshot"
  >,
): Response {
  const { payment, purchase } = finalized;
  if (!payment.receiptHeader || !payment.receiptHash || !payment.receiptTimestamp) {
    throw new Error("Finalized payment receipt is unavailable");
  }
  const route = validatePurchasedRouteIntegrity({
    purchase,
    policyInput: context.policy,
    snapshotInput: context.snapshot,
    expected: {
      routeId: payment.quoteId,
      requestId: payment.requestId,
      buyer: payment.payer,
      executionChainId: payment.executionChainId,
      paymentChainId: payment.paymentChainId,
      paymentId: payment.id,
      receiptHash: payment.receiptHash,
      purchasedAt: payment.receiptTimestamp,
    },
  });
  const response = NextResponse.json({
    routeId: route.id,
    route,
  });
  response.headers.set("Payment-Receipt", payment.receiptHeader);
  response.headers.set("X-Cobia-Receipt-Hash", payment.receiptHash);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/requests/[id]/quotes/[quoteId]/reveal">,
): Promise<Response> {
  const { id, quoteId: quoteIdInput } = await context.params;
  try {
    const quoteId = QuoteIdSchema.parse(quoteIdInput);
    const body = RevealRequestSchema.parse(await request.json());
    const requests = getRequestRepository();
    const payments = getPaymentRepository();
    const nowSec = Math.floor(Date.now() / 1_000);
    const paymentContext = await requests.getPaymentContext(id, quoteId);
    const storedAttempt = await payments.getPaymentByRequest(id);
    let paymentConfig: ReturnType<typeof readPaymentConfig> | undefined;
    const terms = storedAttempt
      ? await paidRevealStep(
          "PAYMENT_CONTEXT_CHANGED",
          "Stored payment terms no longer match the selected route.",
          () => validateContextPaymentTerms(paymentContext, storedAttempt.paymentTerms),
        )
      : buildContextPaymentTerms(paymentContext, paymentConfig = readPaymentConfig());
    const proofContext = {
      realm: terms.realm,
      requestId: id,
      quoteId,
      owner: paymentContext.policy.owner,
      paymentChainId: terms.paymentChainId,
      executionChainId: paymentContext.policy.executionChainId,
      paymentTermsHash: hashPaymentTerms(terms),
      expiresAt: terms.expiresAt,
    } as const;
    const recovering = storedAttempt?.state === "settled" || storedAttempt?.state === "finalized";
    // Recovery reauthorizes access to a paid artifact; it never reopens settlement.
    const proof = await paidRevealStep(
      "INVALID_REVEAL_PROOF",
      "Reveal ownership proof is invalid or expired.",
      () => recovering
        ? verifyRevealRecoveryProof(
            body.proof,
            body.ownerSignature,
            proofContext,
            Math.floor(Date.now() / 1_000),
          )
        : verifyRevealProof(body.proof, body.ownerSignature, proofContext, nowSec),
    );
    if (storedAttempt && (
      storedAttempt.quoteId !== quoteId
      || storedAttempt.paymentTermsHash !== proofContext.paymentTermsHash
      || !isAddress(storedAttempt.payer)
      || !isAddressEqual(storedAttempt.payer, paymentContext.policy.owner)
    )) throw new PaidRevealClientError(
      "PAYMENT_CONTEXT_CHANGED",
      "Stored payment context no longer matches the selected route.",
    );
    const recover = async (attempt: NonNullable<typeof storedAttempt>) => {
      if (!attempt.receiptTimestamp) throw new Error("Settled payment context is unavailable");
      await verifySettledRevealPaymentContext(
        paymentContext,
        quoteId,
        Math.floor(attempt.receiptTimestamp.getTime() / 1_000),
      );
      return purchasedRouteResponse(
        await payments.finalizePayment(attempt.id),
        paymentContext,
      );
    };
    if (recovering && storedAttempt) return await recover(storedAttempt);

    await paidRevealStep(
      "ROUTE_NO_LONGER_ELIGIBLE",
      "The selected route is no longer eligible for settlement.",
      () => verifyCurrentExecutablePaymentContext(
        paymentContext,
        quoteId,
        Math.floor(Date.now() / 1_000),
      ),
    );
    const proofHash = revealProofCommitment(proof);
    const attempt = storedAttempt ?? await payments.beginPayment({ proof, proofHash, terms });

    if (attempt.state === "settled" || attempt.state === "finalized") {
      return await recover(attempt);
    }

    const authorization = request.headers.get("authorization");
    if (attempt.credentialHash && !authorization) {
      throw new PaidRevealClientError(
        "PAYMENT_RECONCILIATION_REQUIRED",
        "Payment settlement requires provider reconciliation before retry.",
      );
    }
    let credentialBinding: { hash: Hash; validAfter: number } | undefined;
    if (authorization) {
      const validated = await paidRevealStep(
        "PAYMENT_CREDENTIAL_REJECTED",
        "Payment credential is invalid or expired.",
        () => validatePaymentCredential(
          request,
          { terms, owner: paymentContext.policy.owner },
          Math.floor(Date.now() / 1_000),
        ),
      );
      if (!attempt.challengeId || validated.credential.challenge.id !== attempt.challengeId) {
        throw new PaidRevealClientError(
          "PAYMENT_CREDENTIAL_REJECTED",
          "Payment credential does not match the stored challenge.",
        );
      }
      await paidRevealStep(
        "ROUTE_NO_LONGER_ELIGIBLE",
        "The selected route is no longer eligible for settlement.",
        () => verifyCurrentExecutablePaymentContext(
          paymentContext,
          quoteId,
          Math.floor(Date.now() / 1_000),
        ),
      );
      credentialBinding = {
        hash: commitment({ credential: authorization }),
        validAfter: Number(validated.authorization.validAfter),
      };
    }

    const freshContext = await requests.getPaymentContext(id, quoteId);
    await paidRevealStep(
      "PAYMENT_CONTEXT_CHANGED",
      "Stored payment terms no longer match the selected route.",
      () => validateContextPaymentTerms(freshContext, terms),
    );
    await paidRevealStep(
      "ROUTE_NO_LONGER_ELIGIBLE",
      "The selected route is no longer eligible for settlement.",
      () => verifyCurrentExecutablePaymentContext(
        freshContext,
        quoteId,
        Math.floor(Date.now() / 1_000),
      ),
    );

    paymentConfig ??= readPaymentConfig();
    const payment = createPaymentServer(terms.realm, paymentConfig.MPPX_SECRET_KEY);
    const charge = payment.charge({
      ...paymentTermsToChargeOptions(terms),
      meta: { paymentId: attempt.id, revealProofHash: attempt.revealProofHash },
    });
    if (credentialBinding) {
      await payments.bindCredential(attempt.id, credentialBinding.hash, credentialBinding.validAfter);
    }
    const result = await charge(request);
    if (result.status === 402) {
      const challenge = Challenge.fromResponse(result.challenge);
      await payments.bindChallenge(attempt.id, challenge.id);
      result.challenge.headers.set("Cache-Control", "no-store");
      return result.challenge;
    }
    if (!authorization) throw new Error("Payment server settled without a credential");

    const receiptResponse = result.withReceipt(new Response(null));
    const receiptHeader = receiptResponse.headers.get("Payment-Receipt");
    if (!receiptHeader) throw new Error("Payment settled without a receipt header");
    const settled = await payments.recordSettlement(attempt.id, receiptHeader);
    if (!settled.receiptTimestamp) throw new Error("Settled payment timestamp is unavailable");
    const settledAtSec = Math.floor(settled.receiptTimestamp.getTime() / 1_000);
    const settledContext = await requests.getPaymentContext(id, quoteId);
    await paidRevealStep(
      "ROUTE_NO_LONGER_ELIGIBLE",
      "The selected route is no longer eligible for settlement.",
      () => verifyCurrentExecutablePaymentContext(
        settledContext,
        quoteId,
        settledAtSec,
      ),
    );
    return purchasedRouteResponse(
      await payments.finalizePayment(attempt.id),
      settledContext,
    );
  } catch (error) {
    const clientError = paidRevealClientError(error);
    return NextResponse.json({
      code: clientError.code,
      message: clientError.message,
      requestId: id,
    }, { status: clientError.status, headers: { "Cache-Control": "no-store" } });
  }
}
