import {
  cobiaMarkets,
  cobiaQuotes,
  cobiaRequests,
  requestState,
} from "./request-schema";
import { cobiaPayments, paymentState } from "./payment-schema";
import {
  cobiaActivityEvents,
  cobiaExecutionRehearsals,
  cobiaRoutePurchases,
  executionRehearsalState,
} from "./route-schema";

export * from "./payment-schema";
export * from "./request-schema";
export * from "./route-schema";

export const cobiaSchema = {
  cobiaMarkets,
  cobiaRequests,
  cobiaQuotes,
  cobiaPayments,
  cobiaRoutePurchases,
  cobiaExecutionRehearsals,
  cobiaActivityEvents,
  requestState,
  paymentState,
  executionRehearsalState,
};

export type CobiaRequestState = (typeof requestState.enumValues)[number];
export type CobiaPaymentState = (typeof paymentState.enumValues)[number];
export type CobiaExecutionRehearsalState =
  (typeof executionRehearsalState.enumValues)[number];
