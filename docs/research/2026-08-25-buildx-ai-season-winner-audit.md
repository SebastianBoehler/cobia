# BuildX AI Season winner audit

Date: 2026-08-25  
Scope: the three winners announced by X Layer—IGNIX, MetAgents, and Sarf—compared with Cobia.  
Evidence policy: primary sources only (official X accounts/posts, live products/docs/APIs, public repositories, X Layer RPC/explorer, and the official rules). Public observations are a point-in-time snapshot from 2026-08-25; absence means “not found in the inspected public sources,” not proof that private submission evidence did not exist.

## Executive finding

[X Layer announced](https://x.com/XLayerOfficial/status/2092248785485463839) that it received **102 projects** and awarded:

1. [IGNIX](https://x.com/XLayerOfficial/status/2092248797653213281)
2. [MetAgents](https://x.com/XLayerOfficial/status/2092248809892118839)
3. [Sarf](https://x.com/XLayerOfficial/status/2092248821929787606)

IGNIX and Sarf both have strong public evidence for a live AI-related product on X Layer mainnet, a dedicated project account, and a pre-deadline X post mentioning `@XLayerOfficial`. Neither exposes enough public history to verify the required testnet-first sequence or its private Google Form submission time.

MetAgents is different. X Layer’s award is direct evidence that the organizer accepted it, but the project’s current public footprint does not independently demonstrate the mandatory submission conditions: its only visible original X post is after the deadline, its site says it launches on 2026-09-07, and no public X Layer deployment evidence was found. That is a material **public-verifiability gap**, not proof of disqualification; earlier posts, deployments, or form evidence may be private, deleted, renamed, or overwritten.

Cobia has the most reproducible engineering and qualification trail of the four: public code and submission documentation, observable testnet and mainnet deployments, an explicit pre-deadline X post, independent solver/verifier roles, and live verified outcomes. IGNIX’s advantage is visible onchain activity and a highly legible growth loop; Sarf’s is a narrow, polished conversational RWA product; MetAgents’ public evidence is presently too thin for an evidence-based product comparison.

## Deadline-state correction for Cobia

The strong current Cobia should not be treated as the artifact the judges saw.
The [formal submission thread](https://x.com/Cobia_Web3/status/2090942878738424299)
was posted at **2026-08-21 23:23 UTC**, only 36 minutes before the cutoff. The
deadline-proximate repository snapshot, commit
[`7a2f4a2`](https://github.com/SebastianBoehler/cobia/commit/7a2f4a202d88c5a55084befc0b831b159a604a26),
was authored at 23:51 UTC. Its judge page advertised one confirmed mainnet
outcome, described testnet as paused by design, marked the Ethy/x402 canary as
pending, placed the first external solver in the 30-day roadmap, and said
financial controls remained gated pending production checks.

Several capabilities later used to argue that Cobia was a top-two contender
were post-deadline work: composed solver competition landed on August 22;
general-asset Executor V4 was implemented and released across August 23–24;
xStocks support first appeared on August 24; and the confirmed TSLAx proof was
published in commit
[`2e416da`](https://github.com/SebastianBoehler/cobia/commit/2e416da)
at **2026-08-25 09:23 UTC**, about four and a half hours before the official
results. X Layer has not published its judging freeze time, but there is no
sound basis for assuming those late capabilities influenced the submitted
score. The earlier rank-one audit was therefore a defensible comparison of the
current public product, not a defensible reconstruction of the deadline
submission. Conflating those snapshots materially overstated Cobia's odds.

## Controlling requirements

The [official BuildX page](https://web3.okx.com/xlayer/build-x-series) states that AI Season ran from 2026-08-07 through **2026-08-21 23:59 UTC**. It required:

- AI elements integrated into the product;
- deployment to X Layer testnet during the hackathon and subsequent deployment to mainnet;
- a dedicated, active project X account;
- an official-account post mentioning `@XLayerOfficial` at submission; and
- a Google Form submission by the deadline.

Its judging dimensions were AI application, innovation, completeness, user value, X Layer integration, growth potential, and ecosystem contribution. The organizer also reserved final authority over eligibility, judging, and winners. Therefore, an official award and a fully reproducible public compliance record are related but different claims.

## 1. IGNIX (`@Ignixbot`)

### What it built

IGNIX is a universal launch platform for AI-agent assets, RWA-backed tokens, and community assets. Its [winner description](https://x.com/XLayerOfficial/status/2092248797653213281) emphasizes revenue/backing-linked issuance, reusable vault templates, and onchain launch controls. The [live product](https://ignix.bot/) and [docs](https://ignix.bot/docs) show bonding-curve launches that graduate to Uniswap, configurable fees/taxes, vaults, founder rounds, reserves, and buybacks.

The AI integration is commercially concrete but architecturally different from Cobia’s: according to IGNIX’s [agent-verification docs](https://ignix.bot/docs/agent-verification), an external AI agent can be linked to a token, ownership is verified offchain, and revenue from an OKX AI escrow contract can feed founder/buyback mechanics. The public docs do not show a model deciding or verifying launch transactions; the AI element is chiefly the financialization and revenue verification of AI-agent businesses.

### Qualification evidence

| Requirement | Public evidence | Assessment |
| --- | --- | --- |
| AI integrated | Agent ownership/revenue linkage and agent-token launch mechanics are documented in the [agent-verification flow](https://ignix.bot/docs/agent-verification). | Supported. |
| Mainnet | The [official address registry](https://ignix.bot/docs/developers/addresses) lists manager, factory, hooks, lockers, and vault contracts. The manager at [`0x96b5…c309`](https://web3.okx.com/explorer/x-layer/evm/address/0x96b51c57e5346d0c0198899243cf851d1e23c309) was labeled by the explorer and showed 2,119 transaction records at audit time. Its [creation transaction](https://web3.okx.com/explorer/x-layer/evm/tx/0x84c590e3f1f52ac9b508345698602450ec1df3b03d5991b6eab5927a6585de8e) succeeded; X Layer RPC block-time reconstruction places first code at 2026-08-19 12:29 UTC. The live [launch API](https://api.ignix.bot/v1/launches?limit=50&page=1) returned 226 launches. | Strongly supported, before deadline. |
| Testnet-first | No testnet address, explorer receipt, or testnet post was found in the inspected current docs/account. | Unknown publicly. |
| Dedicated active X account | [`@Ignixbot`](https://x.com/Ignixbot) joined in August 2026 and had 203 posts and about 3,842 followers at audit time. | Supported. |
| Mention post | The [launch/submission thread](https://x.com/Ignixbot/status/2090419353099599893) mentioned `@XLayerOfficial`, described the product, and said it was live on X Layer. Its X status ID resolves to **2026-08-20 12:43 UTC**, before the deadline. | Supported. |
| Form by deadline | Google Form records are not public. | Unknown publicly. |

**Qualification conclusion:** appears qualified. Four visible conditions are supported; testnet-first and private form timing cannot be independently verified. Its official first-place award indicates the organizer accepted its submitted evidence.

No public source repository was found. A public repository was not itself an explicit mandatory condition.

## 2. MetAgents (`@MetagentsHQ`)

### What it built—or submitted

X Layer’s [winner description](https://x.com/XLayerOfficial/status/2092248809892118839) says MetAgents built infrastructure for agents to discover services, accept tasks, collaborate, and settle on X Layer, including identity, task matching, escrow, arbitration, and payments for agent-to-agent commerce.

The [current live site](https://metagents.ai/) presents a somewhat different forward-looking product: one “Super Agent” and a natural-language factory for creating agents and publishing them as OKX.AI A2A service providers. It says **“Launching 2026.09.07”** and showed 67.4% launch progress during this audit. It did not expose X Layer addresses, testnet/mainnet receipts, or the escrow/arbitration/payment implementation described by X Layer.

### Qualification evidence

| Requirement | Public evidence | Assessment |
| --- | --- | --- |
| AI integrated | Both X Layer’s description and the current site describe AI-agent infrastructure/factory functionality. | Claimed by first-party sources, but implementation is not publicly inspectable. |
| Mainnet | No contract address, transaction, explorer link, public API evidence, or repository was found. The current site describes a future launch. | Not independently verified. |
| Testnet-first | No public evidence found. | Unknown publicly. |
| Dedicated active X account | [`@MetagentsHQ`](https://x.com/MetagentsHQ) joined in December 2024 but showed only two timeline items at audit time: one original post and a repost of the winner announcement. | An account exists; “active” before submission is not reproducible from the current timeline. |
| Mention post | The only visible original [project post](https://x.com/MetagentsHQ/status/2092236815076040726) says a major rebuild is coming. Its status ID resolves to **2026-08-25 13:05 UTC**, roughly four days after the deadline and 48 minutes before the winner announcement. No pre-deadline submission post was found. | Not independently verified. |
| Form by deadline | Google Form records are not public. | Unknown publicly. |

**Qualification conclusion:** X Layer formally selected it, so the organizer evidently considered it eligible under rules that reserve final decisions to X Layer. However, based only on the public evidence now available, MetAgents cannot be independently requalified: mainnet, testnet-first, pre-deadline mention post, active-account history, and form timing remain unverified. The correct conclusion is **organizer-qualified, publicly unreproducible**, not “definitely ineligible.”

Plausible explanations include a renamed/recycled account, deleted submission thread, replaced website, private contracts, or evidence supplied only through the form. None could be confirmed from the permitted sources.

## 3. Sarf (`@managerx_ai`)

### What it built

Sarf is a noncustodial RWA portfolio copilot and MCP connector for Claude/ChatGPT. X Layer’s [winner description](https://x.com/XLayerOfficial/status/2092248821929787606) says it supports 40 tokenized stocks and ETFs and uses EIP-7702 session keys with limits. The [live product](https://sarf.managerx.xyz/) advertises 40 assets on chain 196 and builds trades for the user to sign.

The [first-party “How it works” page](https://sarf.managerx.xyz/how) documents its MCP endpoint, passkey login, always-ask and capped-autonomous modes, unsigned transaction construction, and the rule that transfers are never delegated. Its AI integration is direct and easy to demonstrate: a user asks Claude or ChatGPT to analyze or trade an asset; Sarf supplies market/portfolio tools and transaction construction.

### Qualification evidence

| Requirement | Public evidence | Assessment |
| --- | --- | --- |
| AI integrated | The [MCP workflow](https://sarf.managerx.xyz/how) runs inside Claude/ChatGPT and exposes portfolio, analysis, and transaction tools. | Supported. |
| Mainnet | The live [`/healthz`](https://sarf.managerx.xyz/healthz) endpoint reported chain ID 196, 40 tradable assets, and delegated execution. The live [RWA registry API](https://sarf.managerx.xyz/api/rwa/list) returned 40 X Layer asset addresses. The product links its EIP-7702 enforcement contract at [`0xaeBc…1946`](https://web3.okx.com/explorer/x-layer/evm/address/0xaeBc963A2e8c3e42d070f5767Def5Fe430151946); X Layer RPC block-time reconstruction places first code at 2026-08-12 00:27 UTC. | Strongly supported, before deadline. |
| Testnet-first | No chain-1952 address, explorer receipt, or testnet post was found in the inspected current site/account. | Unknown publicly. |
| Dedicated active X account | [`@managerx_ai`](https://x.com/managerx_ai) joined in July 2026, had 28 posts, and identifies itself as Sarf/ManagerX. | Supported, although the handle makes the Sarf name less searchable. |
| Mention post | The [submission thread](https://x.com/managerx_ai/status/2089733609489920307) mentioned `@XLayerOfficial` and demonstrated the MCP, EIP-7702 controls, connector, passkey, funding, and bridging flow. Its status ID resolves to **2026-08-18 15:18 UTC**, before the deadline. | Supported. |
| Form by deadline | Google Form records are not public. | Unknown publicly. |

The first-party [`/api/stats`](https://sarf.managerx.xyz/api/stats) reported 16 total users/accounts at audit time. That is a product-reported account count, not independent proof of active users or executed trades.

**Qualification conclusion:** appears qualified. AI, mainnet, a dedicated account, and a timely mention post are visible; testnet-first and form timing remain private/public unknowns. Its official third-place award indicates the organizer accepted its evidence.

No public source repository was found.

## Rubric comparison with Cobia

Cobia evidence used here is its [canonical submission](https://github.com/SebastianBoehler/cobia/blob/main/docs/SUBMISSION.md), [public repository](https://github.com/SebastianBoehler/cobia), [pre-deadline X post](https://x.com/Cobia_Web3/status/2090604315052302774) at 2026-08-21 00:58 UTC, [mainnet status API](https://getcobia.com/api/network/status), [testnet status API](https://testnet.getcobia.com/api/network/status), and [live network page](https://getcobia.com/network). At audit time the network page showed 37 confirmed outcomes, $45.92595121 verified outcome volume, four winning solvers, and zero excluded outcomes; mainnet was live on chain 196, while the deployed chain-1952 system was transparently paused.

| Official dimension | IGNIX | MetAgents | Sarf | Cobia |
| --- | --- | --- | --- | --- |
| AI application | AI-agent ownership/revenue becomes a launchable financial primitive; model-level decision logic is not shown. | Agent-native task/service network in X Layer’s description; implementation unavailable. | Clearest user-facing AI loop: analysis and transaction construction inside Claude/ChatGPT. | Deepest inspectable AI-control architecture: competing solvers plus independent verification before owner signing. |
| Innovation | Strong combination of launch markets, revenue backing, RWA vaults, and reusable tokenomics. | Identity, matching, escrow, arbitration, and settlement could be meaningful A2A infrastructure; unverified publicly. | MCP-native brokerage plus constrained EIP-7702 delegation is differentiated and legible. | Strong technical novelty in explicit intent constraints, transaction-program verification, fork replay, and noncustodial signing. |
| Completeness | Strongest visible market operation: 226 API-listed launches and 2,119 manager transaction records. | Current site is a pre-launch page; submitted completeness cannot be reconstructed. | Polished narrow workflow, live assets/API/contracts; reported user count remains small. | Public end-to-end system and code, 37 verified outcomes; broader workflow creates more product surface and explanation cost. |
| User value | Immediate: launch and trade agent/RWA/community assets. | Potentially valuable agent labor/commerce layer, but current proof is insufficient. | Immediate: ask an assistant to analyze or prepare RWA trades without surrendering custody. | Valuable safety and execution assurance for intent-based DeFi, but less instantly legible to a casual judge/user. |
| X Layer integration | Deep and activity-producing: factories, hooks, vaults, launches, and trading. | Described as chain-native; public evidence unavailable. | Meaningful: chain-196 RWA contracts and EIP-7702 enforcement. | Deep: mainnet and testnet control planes, solver execution, independent verification, receipts, and outcome accounting. |
| Growth potential | Strongest demonstrated distribution/activity signal and a clear asset-factory flywheel. | Ambitious platform narrative but little current public adoption evidence. | Large conversational-AI/RWA distribution surface with low-friction MCP onboarding. | Protocol-like upside, but current volume and attributable external adoption are modest. |
| Ecosystem contribution | Generates assets and visible X Layer transaction activity. | Could supply shared A2A commerce infrastructure if the submitted system matches the description. | Makes X Layer RWAs accessible from mainstream assistants. | Strongest open engineering contribution: public code, contracts, workflows, evidence boundaries, and reusable verification concepts. |

The result is defensible if judges weighted **visible adoption, product immediacy, and growth loops** more heavily than technical defensibility alone. IGNIX visibly dominates those signals. Sarf compresses its value into one demo sentence. Cobia likely led on inspectability, control architecture, and honest evidence, but its advantage required more explanation and its live usage remained modest. MetAgents cannot be fairly scored from its current public state; the judges may have had form/demo evidence that is no longer public.

## Why earlier competitor discovery missed these projects

1. **There was no public entrant roster.** X Layer disclosed the 102-project field only in the [winner announcement](https://x.com/XLayerOfficial/status/2092248785485463839). Earlier research could only discover indexed public artifacts.
2. **Repository-first discovery had low recall.** No public source repository was found for any winner. All three were primarily product/X submissions, whereas Cobia’s strongest evidence is unusually repository-centric.
3. **Their posts were weakly indexed by the competition vocabulary.** IGNIX and Sarf mentioned `@XLayerOfficial`, but their visible product copy did not consistently foreground “BuildX AI Season.” A search requiring those words would miss them.
4. **They appeared late.** IGNIX’s manager contract first appeared on mainnet on August 19 and its launch post was August 20. Even a careful earlier sweep could precede indexing or material deployment.
5. **Name/handle mismatches obscured Sarf.** The winning product is “Sarf,” but its account is `@managerx_ai`, its domain is under `managerx.xyz`, and older ManagerX material can look like a different project or season.
6. **MetAgents’ public surface is mutable and apparently post-deadline.** Its only visible original post is from August 25 and the present website describes a September launch/rebuild. If submission-era posts or pages existed, they are no longer visible under the inspected current surface.
7. **Conservative qualification filters traded recall for precision.** Excluding projects without firm current-season linkage prevented stale or unrelated entries from contaminating the comparison, but necessarily hid late, renamed, non-repository, or form-only entrants.
8. **The private form is a blind spot.** Exact form timestamps, unpublished testnet addresses, demos, and judge-only evidence cannot be recovered from public search.

## Bottom line on qualification

- **IGNIX:** publicly appears to qualify; testnet-first and form timing remain unknown.
- **Sarf:** publicly appears to qualify; testnet-first and form timing remain unknown.
- **MetAgents:** officially treated as qualified, but current public evidence is insufficient to independently verify several mandatory conditions. This is the only winner that raises a substantive public-audit concern.
- **Cobia:** exposes the clearest independently reproducible qualification and engineering trail, including both networks and a timely official-account post. That strength did not guarantee a prize because the judging rubric also rewarded completeness, immediate user value, growth potential, and ecosystem activity—not compliance or technical depth alone.
