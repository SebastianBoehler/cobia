# Cobia — X Layer Build X AI Season submission

- **Competition:** X Layer Build X General Hackathon, AI Season, August 2026
- **Project:** Cobia
- **Product:** <https://getcobia.com>
- **Source:** <https://github.com/SebastianBoehler/cobia>
- **Public evidence:** <https://getcobia.com/buildx>
- **Network ledger:** <https://getcobia.com/network>
- **Status snapshot:** 25 August 2026

This is the canonical judging and evidence index. Mutable network counts are
timestamped; live pages and chain receipts remain the current source.

## 100-word summary

Cobia is a non-custodial intent and transaction-program verifier for X Layer.
A user describes an onchain outcome and signs exact limits. Independent AI and
deterministic solvers compete to propose programs, but they never receive the
user's signing key or permission to broadcast. Cobia resolves registered token
and protocol identities, checks policy bounds and exact calls, reproduces an
accepted program on a disposable X Layer fork, and offers only the attested
transactions to the owner wallet. Public program pages connect proposals,
verdicts, receipts, postconditions, and explorer links. V4 standard-token swaps
and a registered TSLAx acquisition are proven on X Layer mainnet.

## Judge path

### 60-second evidence review

1. Read the [AI Season page](https://getcobia.com/buildx) for the product loop,
   current capability labels, X Layer relevance, and public evidence.
2. Inspect the [TSLAx program](https://getcobia.com/programs/3ceb168b-3a54-4560-ad9a-c1614401d6db)
   and [confirmed transaction](https://web3.okx.com/explorer/x-layer/evm/tx/0xd8381e286f7dadde6a5ab363223b264b51f5aac4cc04cc3a41bfa979f67fcc4f).
3. Inspect the reverse [full-balance TSLAx sale](https://getcobia.com/programs/88b29eb4-0e30-4108-be11-30f157fa1e70)
   and its [confirmed transaction](https://web3.okx.com/explorer/xlayer/tx/0x7fc3f00d7951fdea18cd890690cd322869d113043bf2ec9fa1d362a06348e7ad).
4. Inspect the separate [V4 program](https://getcobia.com/programs/4d1ccd00-1b2d-485a-9f57-6e4416959126)
   and [confirmed transaction](https://web3.okx.com/explorer/x-layer/evm/tx/0x573cf9e9e0c21e4cf1585cc4a4ec36a56d4063c779bb3de4e8bf514c56e2543f).

### Five-minute product review

1. Open [Create intent](https://getcobia.com/intents/new) and select the
   registered TSLAx example.
2. Review the explicit assets, maximum spend, minimum outcome, chain,
   eligibility, deadline, and wallet-bound policy before signing.
3. Follow the competition as solvers publish immutable revisions, abstain, or
   fail verification; no proposal is executable merely because a solver signed it.
4. Inspect the winning program's policy, pinned evidence, verifier verdict,
   fork replay, exact wallet stages, and final owner confirmation.
5. Compare the confirmed receipt and postconditions with the public transaction
   and the [Network ledger](https://getcobia.com/network).

The existing embedded product-flow recording predates V4 and xStocks. It is not
the current proof. The linked programs and transactions above are authoritative;
a fresh V4/xStocks judge recording is a roadmap deliverable.

## What is live, verified, or planned

| Capability | State | Exact boundary |
| --- | --- | --- |
| Plain-language signed intents | **Live mainnet** | Owner-specific X Layer policies with explicit objective, asset, amount, capability, deadline, freshness, and nonce bounds |
| Solver exchange | **Live mainnet** | Signed intake, independent profiles, immutable revisions, abstention, ranking, and replay protection |
| General Asset V4 | **Live mainnet** | Public same-chain X Layer OKX path for independently verified standard ERC-20 identities and behavior |
| TSLAx acquisition | **Live mainnet proof** | One registered xStock identity and route with eligibility evidence, exact calls, receipt-token delta, and owner-wallet confirmation |
| Aave, Curve, and Uniswap semantics | **Live / verified in fork** | Registered Aave supply plus exact-input Curve and Uniswap routes; composition remains intentionally bounded |
| x402 commerce | **Live, bounded** | Exactly pinned merchant resource, network, product, price, payee, payer, deadline, and settlement evidence |
| Multi-stage wallet programs | **Implemented** | Registered or fully covered exact calls, independently replayed, then submitted one owner-confirmed stage at a time |
| Multi-wallet and multi-asset judge evidence | **Roadmap** | New many-to-one, one-to-many, and many-to-many demonstrations must link their public programs and receipts |
| LI.FI, bridging, Ethereum runtime | **Not public** | No production claim until each chain and delivery lane passes the same identity, replay, execution, and receipt gates |
| Recurring authority and LP exits | **Not implemented** | Require separate cancellation, renewal, ownership, and terminal-postcondition designs |

## Why Cobia is technically different

Most agentic transaction products combine route generation and execution
authority. Cobia deliberately separates them:

```text
owner-signed limits
  -> AI and deterministic solver proposals
  -> deterministic identity and policy verification
  -> disposable fresh-fork replay
  -> owner-bound execution material
  -> explicit wallet confirmations
  -> canonical mainnet receipt and postconditions
```

The model can research, write bounded search code, and propose programs. It
cannot sign for the owner, bypass a policy, attest its own output, choose an
unregistered capability as authority, or access a production send method.

For registered capabilities, verifier-owned modules compile the calls. For open
wallet-call programs, the verifier additionally checks code identity, targets,
selectors, approvals, asset flows, event coverage, state deltas, and replayed
postconditions. Unsupported or incomplete programs fail closed.

Read the full [security model](architecture/security-model.md) and
[intent compatibility boundary](architecture/intent-compatibility.md).

## Mainnet evidence manifest

| Object | Link | Claim boundary |
| --- | --- | --- |
| Live product | [getcobia.com](https://getcobia.com) | Current public product on X Layer |
| AI Season page | [Build X evidence](https://getcobia.com/buildx) | Canonical public narrative, capability labels, X Layer contribution, and proof index |
| Network | [Confirmed outcomes](https://getcobia.com/network) | Verifier-derived public ledger; 35 outcomes and four winning solvers at this snapshot |
| TSLAx program | [Program `3ceb…d6db`](https://getcobia.com/programs/3ceb168b-3a54-4560-ad9a-c1614401d6db) | Policy, proposal, evidence, verdict, execution, and receipt for registered TSLAx acquisition |
| TSLAx receipt | [Transaction `0xd838…c4f`](https://web3.okx.com/explorer/x-layer/evm/tx/0xd8381e286f7dadde6a5ab363223b264b51f5aac4cc04cc3a41bfa979f67fcc4f) | `0.002841620235604251 TSLAx` reached the owner wallet |
| TSLAx sale | [Program `88b2…1e70`](https://getcobia.com/programs/88b29eb4-0e30-4108-be11-30f157fa1e70) | Verified full-balance reverse route from TSLAx to USDG |
| TSLAx sale receipt | [Transaction `0x7fc3…7ad`](https://web3.okx.com/explorer/xlayer/tx/0x7fc3f00d7951fdea18cd890690cd322869d113043bf2ec9fa1d362a06348e7ad) | `0.016001666911378385 TSLAx` became `5.618001 USDG` |
| V4 program | [Program `4d1c…9126`](https://getcobia.com/programs/4d1ccd00-1b2d-485a-9f57-6e4416959126) | Separate-wallet V4 standard-token program and receipt evidence |
| V4 receipt | [Transaction `0x573c…543f`](https://web3.okx.com/explorer/x-layer/evm/tx/0x573cf9e9e0c21e4cf1585cc4a4ec36a56d4063c779bb3de4e8bf514c56e2543f) | `0.01 OKB` became `1.169308 USDG` |
| Deployment set | [Build X deployment evidence](https://getcobia.com/buildx#evidence) | Mainnet executor deployment, testnet rehearsal, builder attribution, and source links |
| CI | [CI workflow](https://github.com/SebastianBoehler/cobia/actions/workflows/ci.yml) | Lint, type checks, unit tests, build, database integration, contracts, and topology |
| Security | [Security workflow](https://github.com/SebastianBoehler/cobia/actions/workflows/security.yml) | Dependency audit, CodeQL, and scheduled container scanning |
| Fork replay | [Mainnet fork workflow](https://github.com/SebastianBoehler/cobia/actions/workflows/fork.yml) | Nightly and on-demand pinned X Layer fork rehearsal |

## Official judging-criteria scorecard

The [official AI Season page](https://web3.okx.com/xlayer/build-x-series) lists
AI application, innovation, completeness, user value, X Layer integration,
growth potential, and ecosystem contribution. This mapping is intentionally
evidence-first and includes the strongest current limitation.

| Criterion | Strongest Cobia evidence | Honest limitation |
| --- | --- | --- |
| AI application | Independent coding-agent and deterministic solvers compete on signed outcome programs; public revisions and verifier-derived winners remain inspectable | AI proposes but deliberately receives no execution authority; the product does not claim autonomous custody |
| Innovation | Open-world generation is separated from deterministic semantic verification, fresh-fork replay, owner approval, and onchain postconditions | Adding a new semantic domain requires explicit engineering rather than instant arbitrary-call support |
| Product completeness | Live product, public intent-to-receipt pages, V4 and TSLAx mainnet receipts, network ledger, docs, reference solver, and automated assurance | The fresh V4/xStocks judge video and broader multi-wallet evidence set are not yet published |
| User value | Users can ask AI to search routes without giving a solver their key, then inspect and approve only an independently attested plan | Wallet confirmations and evidence review add deliberate friction compared with blind one-click automation |
| X Layer integration | Chain-196 policies, protocol reads, live execution contracts, OKX routing, X Layer receipts, builder attribution, and nightly mainnet-fork rehearsal | Cross-chain and Ethereum runtime are not public product paths |
| Growth potential | Open solver interface, typed capability registry, general-asset V4 path, MCP surface, and reusable verification pipeline | Independently operated solvers and attributable external users still need to grow |
| Ecosystem contribution | Public source, deployable open-solver example, developer docs, transparent failures, public receipts, and reusable security boundaries | PolyForm Noncommercial is source-available rather than OSI-approved open source |

## Reproduce the central assurance path

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm docs:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Additional lanes require a Docker-compatible runtime:

```bash
pnpm --filter @cobia/web test:integration
pnpm --filter @cobia/web test:fork
pnpm contracts:test
```

The fork lane uses a digest-pinned Foundry/Anvil container and public X Layer
state. It is historical verification evidence, not a promise that a future
transaction will succeed or be profitable.

## Known limitations and next evidence

- Public xStocks proof is currently TSLAx-specific. Catalog discovery does not
  imply that every instrument has eligible liquidity or a verified live route.
- V4 is public for same-chain X Layer standard-token execution. LI.FI, bridges,
  Ethereum runtime, and unusual token behavior remain unavailable.
- APY, fees, utilization, rewards, impermanent loss, and future prices are
  forecasts, not enforceable guarantees.
- External-wallet executions demonstrate separate wallet use; they do not by
  themselves prove independent users or organic adoption.
- The next evidence package is a fresh 60–90 second judge demo plus linked
  many-to-one, one-to-many, many-to-many, and multi-xStocks program receipts.
- Distribution, external solver participation, attributable users, and an
  independent security review remain the clearest non-code gaps.
