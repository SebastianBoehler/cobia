# Cobia Brand and Product Design

## Decision

Cobia uses a light-first product system built around one continuous route thread:

> One request. Many solvers. One verified route.

The interface must make a complex solver market feel as direct as a consumer
DeFi transaction while retaining enough proof for a user to independently audit
the decision. The visual system is original to Cobia. It adopts the interaction
discipline of strong DeFi products without copying their marks, colors, or
component styling.

## Brand position

Cobia is not an AI yield bot, portfolio dashboard, or generic aggregator. It is
an intent market for purchasing verified executable DeFi routes.

Public description:

> Cobia lets wallets request executable DeFi quotes. Independent solvers
> compete, Cobia verifies their proposals, and the wallet pays only the winner
> before revealing and executing the selected route.

Brand attributes:

- Clear before clever.
- Fast without looking reckless.
- Technical without requiring protocol expertise.
- Verifiable without making every screen an explorer.
- Quietly confident; never hype-driven.

## Identity system

### Name and wordmark

The product is always written `Cobia` in prose and `COBIA` in the wordmark. The
wordmark uses a wide, compact sans-serif construction. A lockup includes the
route mark to the left; the wordmark never uses a literal fish.

### Route mark

The mark is constructed from:

1. One input node representing the user's intent.
2. Three paths representing competing solver proposals.
3. One output node representing the verified winner.

Its outer paths loosely form a `C` at small sizes. The geometry must use one
documented grid and ship from one SVG source. The mark may animate only by
drawing the paths from request to verified output.

### Signature product motif

The same route thread connects product states:

```text
Request -> Compete -> Verify -> Choose -> Pay + Reveal -> Execute
```

An invalid proposal visibly terminates at verification. A winning proposal
continues through payment and execution. This is the only ambient visual motion
in the MVP.

## Foundations

### Color

The interface is light-only for the MVP. Colors are implemented as semantic
OKLCH tokens; hex values below are reference anchors, not component literals.

| Role | Reference | Use |
|---|---:|---|
| Paper | `#FBFCFA` | Page background |
| Surface | `#FFFFFF` | Elevated controls and panels |
| Ink | `#111816` | Primary text |
| Muted | `#66706D` | Secondary text |
| Line | `#DDE2DF` | Dividers and borders |
| Cobalt | `#2647F5` | Primary action and active route |
| Cobalt wash | `#F0F3FF` | Selected and explanatory surfaces |
| Verified | `#167A59` | Passed checks and confirmed state |
| Caution | `#9A6700` | Stale or expiring state |
| Rejected | `#D44B3D` | Failed policy or simulation |

Cobalt is the only brand accent. Verified, caution, and rejected colors are
semantic and never used decoratively. State is always communicated by text and
icon in addition to color.

### Typography

- Geist Sans: wordmark adaptation, headings, body, navigation, and controls.
- Geist Mono: hashes, addresses, blocks, amounts, rates, fees, and countdowns.
- Tabular numerals are required for every changing metric.
- Sentence case is the default. Uppercase is limited to the wordmark and small
  data eyebrows.
- The editorial serif from the exploratory mockup is excluded.

### Space and shape

- A 4 px base scale defines all spacing.
- Page sections use 32, 48, or 64 px rhythm.
- Control radii use 8 px; panels use 16 px; major stage surfaces use 24 px.
- Nested corners remain concentric: outer radius equals inner radius plus pad.
- Shadows are reserved for menus and the final payment confirmation sheet.
- Cards represent real objects only: a request, quote, receipt, or simulation.

### Motion

- Route drawing: 500-800 ms, only when state advances.
- Control feedback: 120-180 ms.
- Panel entry: 240-300 ms from 12 px below.
- No parallax, cursor effects, looping gradients, or autonomous card motion.
- `prefers-reduced-motion` replaces route drawing with its final state.

## Voice and terminology

Copy leads with the user's outcome and uses short concrete sentences.

Use:

- `Find the best net yield for 25,000 USDC.`
- `4 solvers submitted. 3 routes passed.`
- `Pay 0.10 USDC to reveal this route.`
- `Route rejected: bridge forbidden.`
- `Your principal remains in your wallet.`

Avoid:

- `AI-powered`, `revolutionary`, `autonomous wealth`, or guaranteed returns.
- Calling a predicted return profit.
- Referring to payment as gas when it is a solver research fee.
- Calling a quote verified when only its JSON schema passed.

## Product navigation

The MVP navigation is deliberately small:

- `New request`
- `My requests`
- `Solvers`
- X Layer network status
- Connected Agentic Wallet

Analytics, strategy discovery, recurring mandates, and portfolio views are not
in the primary navigation.

## End-to-end user flow

### 1. Request

The first screen asks for an outcome, not a protocol route. Its initial surface
contains asset, principal, horizon, and risk cap. `Set limits` progressively
reveals minimum TVL, maximum protocol exposure, minimum net APY, freshness,
expiry, and the no-bridge rule.

The primary action is `Open quote market`. Before submission the UI shows a
plain-language policy receipt and commitment hash. Principal remains in the
wallet.

### 2. Compete

The request page advances without navigating to a generic loading screen. The
route thread reports:

`5 invited -> 4 submitted -> 3 verified -> 1 rejected`

Solver quotes are private. The public surface exposes solver identity, quote
commitment, submission time, and verification progress, but no complete route
or executable calldata.

### 3. Verify

Cobia validates each complete private bundle using deterministic code. The
result surface promotes the most important exception. For the demo, one solver
submits a route containing a bridge and is rejected against a no-bridge policy.

A passed quote requires schema validation, policy validation, source freshness,
recomputed expected return, target allowlisting, and successful simulation or
supported deterministic execution estimation.

### 4. Choose

The quote market is the product's signature screen. It compares:

- Expected net APY and calculation timestamp.
- Risk grade with visible factors.
- Solver research fee.
- Quote validity countdown.
- Verification and simulation result.
- Solver history measured from prior Cobia requests.

The full route remains hidden. Selecting a row opens a persistent summary bar;
the only primary action is `Select quote`.

### 5. Pay and reveal

After selection, the chosen reveal endpoint returns HTTP 402. The confirmation
sheet clearly separates:

- `Solver research: 0.10 USDC`
- `Solver receives: 0.09 USDC`
- `Cobia receives: 0.01 USDC`
- `Principal affected: 0 USDC`

After x402 settlement, Cobia records the receipt, releases the complete bundle,
and checks that its hash matches the pre-payment commitment. Losing solvers are
not paid in the MVP.

### 6. Execute

The route page decodes the selected action into human-readable steps, shows
assets before and after simulation, rechecks expiry, and asks Agentic Wallet to
approve the constrained execution. Principal and solver payment remain visually
and semantically separate.

## Trusted generative presentation

The result layout may adapt to the request, but a model never generates markup,
styles, URLs, or transaction controls. Deterministic presentation code selects
from a closed component union:

- `QuoteOverview`
- `ConstraintMatrix`
- `RejectedRoute`
- `SolverDisagreement`
- `EvidenceSummary`
- `PaymentReceipt`
- `SimulationChanges`
- `ExecutionProof`

If a route is rejected, `RejectedRoute` appears before comparison. If verified
solvers disagree materially, `SolverDisagreement` explains the changed inputs.
Otherwise the block is omitted.

## Testnet truthfulness

The UI must not imply that testnet activity earns real yield.

- X Layer testnet `1952`: real x402 settlement, quote commitments,
  verification commitments, selection, payment receipt, and reveal receipt.
- Verified X Layer mainnet fork: live chain-196 data and Aave execution
  simulation against reviewed bytecode.
- X Layer mainnet `196`: later capped execution only after explicit approval.

The testnet completion state is `Market proof complete`, not `Yield earned`.

## Responsive behavior

- At 1280 px and above, the quote market uses request rail, comparison canvas,
  and verification inspector.
- From 768-1279 px, the request rail collapses above the comparison and the
  inspector becomes a drawer.
- Below 768 px, quotes become stacked comparison rows and the selected summary
  becomes a bottom sheet.
- Tables use horizontal scrolling only for hashes and evidence; critical quote
  metrics never require horizontal scrolling.

## Accessibility

- Every workflow is keyboard-operable with visible focus.
- Status changes use `aria-live="polite"`.
- Quote comparison has real table semantics at desktop and labelled groups on
  mobile.
- Countdown changes do not announce every second.
- All text and control states meet WCAG 2.2 AA contrast.
- Reduced motion and 200% zoom are acceptance cases.

## MVP design acceptance

The visual implementation is accepted when:

1. A new user can describe the payment timing and principal boundary after one
   pass through the flow.
2. The rejected bridge proposal is understandable without opening raw JSON.
3. The full winning route cannot be copied before payment.
4. Every financial number exposes its source time or chain block.
5. Payment, commitment match, simulation, and execution have distinct receipts.
6. The complete flow works at 390 x 844 and 1440 x 900.
7. No screen resembles a generic chatbot or portfolio dashboard.

