# Cobia Atomic Beta Design

## Decision

Cobia will target an atomic, policy-constrained X Layer executor for production.
The existing guided injected-wallet engine remains available only as an
explicitly labeled beta fallback while the executor is implemented and
reviewed. It is not described as an end-to-end atomic guarantee.

The approved initial beta limits are:

- 10 USD maximum input per route;
- 50 USD maximum input per wallet per UTC day;
- 250 USD maximum cumulative beta input before an operator review;
- selected-wallet access only; and
- immediate pause authority.

All supported beta assets use six decimals, so the contract stores these caps
as `10_000_000`, `50_000_000`, and `250_000_000` atomic units. A later asset
with different decimals requires a new reviewed deployment rather than an
environment override.

## Product boundary

“Aggregate the whole chain” means that solvers can search a growing catalog of
reviewed, versioned action adapters and compose those actions into a graph. It
does not mean that an LLM can invent targets, selectors, approvals, recipients,
or calldata.

The agentic solver may:

- compare any opportunities captured by registered adapters at the same block;
- choose between direct, swapped, split, LP, and multi-action candidates that
  the deterministic graph builder produced; and
- explain why a candidate was selected or rejected.

The agentic solver may not:

- add an address, selector, asset, protocol, or action absent from the signed
  policy and active adapter registry;
- supply executable calldata;
- weaken a minimum output, deadline, exposure limit, or postcondition; or
- turn advisory model output into an executable authorization verdict.

## What can be guaranteed

For one atomic transaction Cobia can enforce:

- the maximum amount pulled from the owner;
- exact approved targets and selectors;
- a deadline;
- minimum swap output;
- the beneficiary of supplied assets or positions;
- minimum final token or aToken balance deltas; and
- refund of residual executor-held tokens.

Cobia cannot guarantee future APY. APY is a snapshot-derived estimate. The
contract can guarantee the position entered and the transaction outcome, not
future utilization, rewards, token price, liquidity, or protocol governance.
If a signed minimum estimated pre-gas APY is not met by current candidates, the
correct result is no quote.

## Atomic executor

`CobiaExecutorV1` receives an exact `ExecutionRouteV1` and a Cobia verifier
authorization. The owner must be `msg.sender`. The executor pulls only the
input amount, gives each approved protocol target only the exact temporary
allowance needed for its step, resets that allowance, checks final constraints,
refunds residual supported assets, and emits the policy, bundle, route, and
simulation commitments.

The initial atomic action set is deliberately smaller than the offchain graph:

- direct Aave V3 supply;
- Curve StableSwap NG exact-input followed by Aave V3 supply; and
- Uniswap V3 exact-input followed by Aave V3 supply.

Uniswap V3 NFT mint remains on the guided engine until an onchain validator can
bind the returned token ID, owner, liquidity, ticks, and token consumption.

Each step carries an adapter ID, target, spend token, spend amount, and calldata.
The registry authorizes an exact `(adapterId, target, selector, runtimeCodeHash)`
tuple. Proxy implementation changes cannot be proven with `EXTCODEHASH`; the
offchain deployment monitor therefore pauses the beta on any pinned
implementation-slot drift before issuing a new authorization.

The verifier authorization is EIP-712 data binding:

- environment and chain ID;
- executor address;
- owner;
- policy, snapshot, bundle, route, and simulation hashes;
- input token and amount;
- final-constraint hash;
- deadline; and
- a one-use nonce.

The contract rejects a reused nonce, an expired authorization, a non-selected
wallet, a cap violation, an unauthorized step, a failed call, a failed final
constraint, or residual supported tokens that cannot be refunded.

## Payment prompts

The current 0.10 reveal purchase is one payment with two EIP-3009
authorizations: 0.09 goes directly to the quote signer and 0.01 goes directly
to Cobia. EIP-3009 binds one recipient per authorization, so the direct split
requires two wallet signatures even though it is one purchase.

The executor does not silently change this. Reducing reveal payment to one
signature requires a separately reviewed fee-splitter flow supported by OKX
MPP, or a custodial/credit relationship. Until that is proven, the UI states
the two-signature boundary before the first wallet prompt.

## Simulation and execution evidence

Every executable route has three distinct artifacts:

1. a block-bounded opportunity snapshot;
2. a disposable X Layer mainnet-fork execution trace of the exact executor
   calldata; and
3. an atomic authorization whose route and simulation commitments match.

Immediately before the wallet prompt the server rechecks the pinned deployment
registry, policy deadline, current block, and selected-wallet access. The
transaction itself remains the final authority: if any encoded or final-state
bound fails, the complete transaction reverts.

## Testnet and mainnet deployments

Two independent Vercel projects are used:

- `cobia-testnet`: isolated database, secrets, realm, and public URL; X Layer
  testnet 1952 wallet/payment flows; deployed executor and registry code; no
  claim that mainnet Aave, Curve, or Uniswap exists on testnet; and product
  rehearsal against disposable mainnet-fork state.
- `cobia-beta`: isolated database, secrets, realm, and public URL; X Layer
  mainnet 196 reads and selected-wallet execution; fixed beta caps; and no
  public unrestricted execution.

The same contract bytecode is deployed on both chains. The testnet registry has
no production-protocol permissions unless an official 1952 deployment is
independently verified. Deploying code on testnet proves the Cobia contract and
wallet boundary; the pinned fork and capped mainnet canaries prove real protocol
behavior.

Neither Vercel project reuses the local PostgreSQL database or local secrets.
Each receives a dedicated managed PostgreSQL database and independently rotated
MPP, execution-session, solver, AI, and API credentials.

## Mainnet promotion gates

The mainnet executor remains paused until all of these are green:

- contract unit, fuzz, invariant, and fixed-block fork tests;
- Slither and dependency audit with no unresolved high or critical finding;
- independent adversarial contract review;
- verified source and bytecode on X Layer explorer;
- one exact 10 USD owner canary approved with displayed gas and addresses;
- persisted transaction, receipt, event, and postcondition evidence;
- emergency pause rehearsal; and
- selected-wallet access and cumulative-cap telemetry.

No server-held owner key, automatic background execution, unrestricted public
route, or live upgrade is part of the beta.

## Hackathon evidence

The official AI Season requirements checked on August 11, 2026 are captured
from <https://web3.okx.com/xlayer/build-x-series>:

- meaningful AI in the product;
- deployment on X Layer testnet followed by mainnet launch;
- a dedicated active X account;
- an official X post mentioning `@XLayerOfficial`; and
- Google Form submission by August 21, 2026 at 23:59 UTC.

Cobia targets the general Hackathon Grant. The Liquidity Grant is restricted to
AI-RWA. Launch Grant volume counts only through the OKX DEX interface and not
the OKX DEX API, so it is not used as a delivery claim.

The submission evidence bundle will contain public URLs, explorer links,
contract source verification, repository commit, tests, fixed-block fork trace,
small mainnet canary transactions, architecture diagram, AI boundary, risk
disclosures, demo video, dedicated X account, X post URL, and Form receipt.
