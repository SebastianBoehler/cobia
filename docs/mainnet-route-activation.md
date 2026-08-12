# Mainnet route activation boundary

This document distinguishes the user-facing X Layer route path that is live
today from the coding-agent sandbox lane that is implemented but not activated.
It is an activation checklist, not a claim that arbitrary calls are safe.

## Available on `https://cobia-web.vercel.app`

- A connected EIP-6963 wallet can open `/portfolio` and read its X Layer
  mainnet (`196`) balances and registered Aave V3 positions at a coherent block.
- A signed request can receive deterministic and bounded-agentic V2 quotes over
  registered Aave V3, Curve StableSwap NG, and Uniswap V3 capabilities.
- A purchased V2 route is read only by its owner, rehearsed on an isolated fork,
  then executed by the owner wallet one prepared transaction at a time. The
  server never receives a wallet key or broadcasts a principal transaction.
- The V2 plan is intentionally finite: direct supply, one swap, swap then
  supply, a constrained round trip, or one-sided Uniswap LP preparation. It is
  not a generic multi-protocol program.

For the first self-custodial use, connect the intended wallet at `/portfolio`,
create an intent at `/requests/new`, select and reveal an eligible quote, open
its private route page, run the fork rehearsal, and review every transaction in
the wallet. Do not approve an expired route or a transaction whose wallet view
does not match the prepared step.

## Coding-agent sandbox status

The sandbox vertical slice has these implemented safeguards:

- canonical policy, public address-only portfolio, trusted deployment manifest,
  and pinned X Layer block as its inputs;
- ephemeral Vercel Sandbox execution with declared dependency/source/command
  provenance and a credential-free, read-only RPC broker;
- rejection of signing, wallet, and transaction-send RPC methods, including
  method-normalization bypass attempts;
- an independent proposal verifier and a fresh Anvil fork replay that must
  reproduce deployment identities, trace, state-diff, and balance commitments.

Its current accepted capability is deliberately only `approve` plus Aave V3
`supply` for a registered asset. The sandbox has no public API endpoint, agent
model orchestration, production RPC credential, browser wallet handle, or
server-side principal signer. A coding-agent proposal therefore cannot yet be
selected, purchased, or executed by the production UI.

## Exact work before an agent-authored mainnet route

1. Run the sandbox in a dedicated worker with an authenticated coordinator,
   private read-only RPC broker, bounded model command, job queue, retention
   policy, and audit store. Do not run arbitrary package installation or Anvil
   inside a Vercel request handler.
2. Persist the canonical proposal, sandbox provenance, verifier verdict, and
   fresh replay artifact as a new private route type. Bind its policy, wallet,
   block, and manifest commitments to the existing reveal and execution
   authority records.
3. Add one capability at a time to the verifier. Each needs a strict calldata
   decoder, deployment/proxy identity rules, pre/post-state invariants, event
   assertions, adversarial tests, and a real pinned-fork test. Start with the
   existing Curve or Uniswap exact-input route; do not admit generic `call`.
4. Project verified agent proposals into the guided execution path only when
   every generated transaction is reconstructible from verifier-owned typed
   data. The browser signs the exact reconstructed transactions individually.
5. For atomic multi-protocol guarantees, deploy and independently review the
   paused `CobiaExecutorV1` plus its registry. Configure selected-wallet access,
   fixed 10 USD cap, signer/rotation policy, monitoring, and an emergency pause.
   Deployment and unpausing require separate explicit approval; neither happens
   as a release test.
6. Run one selected-wallet 10 USD canary only after displaying the exact owner,
   tokens, targets, selectors, values, allowance bounds, deadline, maximum OKB
   gas, code identities, trace, state deltas, and postconditions. Re-pause on
   any discrepancy. No bridge, future APY, LP fee, or impermanent-loss claim is
   an atomic guarantee.

Until step 4, “AI-generated route” means a sandboxed research proposal that
the verifier may reject, not an executable user offer. Until step 5, a V2
multi-step route is guided and wallet-confirmed rather than one atomic
transaction.

## Competition mode design

A future five-minute intent auction should use a stable signed policy plus
versioned quote epochs. Solvers may abstain, submit a replacement quote, or
withdraw an unpurchased quote. Every replacement receives a new snapshot,
bundle commitment, validity window, and independent verification; it never
edits an already revealed or purchased route. A deterministic score ranks only
currently valid verified quotes, while the user chooses the final quote.

Charge the user for the selected/revealed route, not for unobservable solver
iterations. If a time-based listing or solver fee is introduced, put its maximum
and expiry in the signed policy and show it before the auction opens. Solver
costs and models remain their own competition; they are not a reason to weaken
the verifier.
