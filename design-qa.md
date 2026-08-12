# Cobia product-design QA

Date: 12 August 2026

## Scope

- Intent entry and conversion path
- Empty route discovery
- Purchased-route outcome hierarchy
- Public proof sharing and social metadata
- Desktop and narrow-screen layout

## Visual comparison

The before and after screens were captured in Google Chrome at the same
`1265 x 712` viewport and compared side by side:

- `/tmp/cobia-product-audit-2026-08-12/compare-entry.png`
- `/tmp/cobia-product-audit-2026-08-12/compare-intent.png`
- narrow-screen check: `/tmp/cobia-product-audit-2026-08-12/after/04-intent-mobile-500.png`

## Findings resolved

1. The home page previously led into an empty market. The primary action now
   starts a new intent; route discovery is secondary.
2. The request form previously led with protocol mechanics. It now leads with
   the user outcome, makes the funding wallet explicit, and keeps detailed
   bounds in the signed policy receipt.
3. The purchased route previously stopped at an allocation list. It now shows
   the expected token or position effect, minimum onchain outcome, horizon
   yield, reveal fee, gas boundary, and break-even principal before execution.
4. Mainnet execution is described as the real, verified stepwise transaction
   path instead of a vague guided demo. Every state-changing call still names
   the explicit wallet-confirmation boundary.
5. Public request proofs now have X sharing, copyable public links, dynamic
   social metadata, and a branded Open Graph image without exposing private
   purchased-route URLs.
6. The mobile header now uses a compact wallet label below `480px`, avoiding
   the min-content overflow seen in the first narrow-screen capture.

## Verdict

Passed for the implemented stablecoin earn flow. The product copy remains
explicit that Cobia searches only registered Aave, Curve, and Uniswap route
families; it does not market the undeployed atomic executor or unsupported
general-purpose arbitrage as a live feature.
