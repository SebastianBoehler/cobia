import type { RouteQuote, RouteQuoteV2 } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import {
  activeQuoteFreshness,
  isActiveRouteQuote,
  publishedRequestQuotes,
  refreshDelayMs,
  visibleRequestQuotes,
} from "./active-quotes";

const nowSec = 1_800_000_000;

function quote(
  idByte: string,
  overrides: Partial<Pick<RouteQuote, "validUntil" | "verification">> = {},
): RouteQuote {
  return {
    version: 1,
    quoteId: `0x${idByte.repeat(64)}`,
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    solverId: `solver-${idByte}`,
    solverAddress: "0x1111111111111111111111111111111111111111",
    bundleHash: `0x${idByte.repeat(64)}`,
    expectedNetApyBps: 100,
    riskGrade: "unassessed",
    priceAtomic: "100000",
    validUntil: nowSec + 1,
    verification: { executable: true, errorCodes: [], score: 100 },
    ...overrides,
  };
}

function routeQuote(routeAuthorized = true): RouteQuoteV2 {
  return {
    version: 2,
    quoteId: `0x${"e".repeat(64)}`,
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    solverId: "route-solver",
    solverAddress: "0x1111111111111111111111111111111111111111",
    bundleHash: `0x${"e".repeat(64)}`,
    estimatedPreGasApyBps: 120,
    riskGrade: "unassessed",
    priceAtomic: "100000",
    validUntil: nowSec + 1,
    authorization: {
      routeAuthorized,
      errorCodes: routeAuthorized ? [] : ["SOLVER_SIGNATURE_INVALID"],
    },
  };
}

describe("active quote visibility", () => {
  it("requires both verifier execution approval and remaining lifetime", () => {
    const rejected = quote("b", {
      verification: { executable: false, errorCodes: ["APY_BELOW_MINIMUM"], score: 0 },
    });
    expect(isActiveRouteQuote(rejected, nowSec)).toBe(false);
    expect(isActiveRouteQuote(quote("c", { validUntil: nowSec }), nowSec)).toBe(false);
    expect(isActiveRouteQuote(quote("d"), nowSec)).toBe(true);
  });

  it("uses narrow V2 route authorization without requiring V1 execution fields", () => {
    expect(isActiveRouteQuote(routeQuote(false), nowSec)).toBe(false);
    expect(isActiveRouteQuote(routeQuote(), nowSec)).toBe(true);
    expect(visibleRequestQuotes({
      state: "quotes_ready",
      selectedQuoteId: null,
      quotes: [routeQuote(false), routeQuote()],
    }, nowSec)).toEqual([routeQuote()]);
  });

  it("shows only eligible quotes in an active competition", () => {
    const eligible = quote("a");
    const rejected = quote("b", {
      verification: { executable: false, errorCodes: ["APY_BELOW_MINIMUM"], score: 0 },
    });
    const expired = quote("c", { validUntil: nowSec });

    expect(visibleRequestQuotes({
      state: "quotes_ready",
      selectedQuoteId: null,
      quotes: [rejected, expired, eligible],
    }, nowSec)).toEqual([eligible]);
  });

  it("retains the selected quote as history after it expires", () => {
    const selected = quote("c", { validUntil: nowSec });
    expect(visibleRequestQuotes({
      state: "revealed",
      selectedQuoteId: selected.quoteId,
      quotes: [quote("a"), selected],
    }, nowSec)).toEqual([selected]);
  });

  it.each(["open", "collecting", "verifying", "failed"])(
    "does not publish stored quotes while the request is %s",
    (state) => {
      expect(publishedRequestQuotes({
        state,
        selectedQuoteId: null,
        quotes: [quote("a")],
      })).toEqual([]);
    },
  );

  it("retains an expired quote only after its request was published", () => {
    const expired = quote("c", { validUntil: nowSec });
    const input = {
      state: "quotes_ready",
      selectedQuoteId: null,
      quotes: [expired],
    };
    expect(visibleRequestQuotes(input, nowSec)).toEqual([]);
    expect(publishedRequestQuotes(input)).toEqual([expired]);
  });

  it("publishes server-relative freshness for the earliest active expiry", () => {
    expect(activeQuoteFreshness([
      quote("a", { validUntil: nowSec + 20 }),
      quote("b", { validUntil: nowSec + 5 }),
      quote("c", { validUntil: nowSec }),
    ], nowSec)).toEqual({
      observedAtSec: nowSec,
      nextExpirySec: nowSec + 5,
    });
    expect(activeQuoteFreshness([quote("c", { validUntil: nowSec })], nowSec))
      .toEqual({ observedAtSec: nowSec, nextExpirySec: null });
  });

  it("caps refresh delays below the signed browser timer limit", () => {
    expect(refreshDelayMs({
      observedAtSec: nowSec,
      nextExpirySec: nowSec + 3_000_000,
    })).toBe(2_147_000_000);
    expect(refreshDelayMs({ observedAtSec: nowSec, nextExpirySec: null })).toBeNull();
  });
});
