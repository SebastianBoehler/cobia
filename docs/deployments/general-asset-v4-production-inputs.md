# General Asset V4 production inputs

Frozen on 23 August 2026. The input files are signer-free plans and checksummed
Transaction Builder batches. The executed X Layer proposal is recorded separately below;
no activation, migration, or public opening has occurred.

## Reviewed adapter manifest

- Manifest: [`general-asset-v4-okx-manifest.json`](./general-asset-v4-okx-manifest.json)
- Canonical commitment: `0x73a6338a76d461a7b3385bf790deacc3046e0bb6dbaa9b744db8ca2251b658c9`
- File SHA-256: `aefab7632fa786ac964d02214d5c34b40b78c8fe16b754aa3ddbb28cfd65288e`
- Included: same-chain OKX `okx.swap@1` on Ethereum and X Layer, with exact target,
  selector, approval spender, and both target/spender runtime code hashes.
- Omitted: LI.FI. The reviewed live USDt0/USDC route did not supply a truthful
  destination completion emitter for the current verifier, and a Diamond runtime hash
  alone does not bind its facet logic.

The entry order is schema-valid. The canonical keys compare as strings, so
`okx.swap@1:196:...` sorts before `okx.swap@1:1:...`.

## Zero-delay hackathon replacement

The final X Layer launch profile makes the governance delay a constructor-bound
RiskManager value and sets it to zero. Emergency pause, wallet deny, exact verifier
authorization, and the deployed `$1,000` route, `$5,000` wallet/24h, and `$50,000`
protocol/24h caps remain unchanged.

At the planning snapshot the operator pending nonce was `20`. The signer-free plan is
[`general-asset-v4-xlayer-zero-delay-unsigned-plan.json`](./general-asset-v4-xlayer-zero-delay-unsigned-plan.json)
(SHA-256 `6d3aa053c11af02bd3074a9c80e73db3c52a55ab02e92931ec0825b0b8088e22`).
It predicts RiskManager V2 `0x02f436b5E6DaDF4aaF9B13844A8fc8b1cDD5672C` at nonce `20`
and Executor V4 `0x3a04e65b2edf263EAe7207DE5a5745ccF41797BF` at nonce `21`.

The checksummed Transaction Builder artifact is
[`general-asset-v4-xlayer-zero-delay-safe-batches.json`](./general-asset-v4-xlayer-zero-delay-safe-batches.json)
(SHA-256 `314f6536642346082b1c707e5682b1f7e48b5223bb28150e8b364db3f4200fef`).
Its immediate-canary batch has checksum
`0x794541ece3d0686a6613b531b0462608951fbce461b23bd28cc4465cd97a9b21`
and contains `proposeWallet`, `proposeUnpause`, `activateWallet`, and
`activateUnpause`. Its public batch has checksum
`0x3c8d5cd59259e8243b6e95da6374f58631771fdc2a336aa2baab4438c003f7f6`
and contains `proposeOpenAccess` followed by `activateOpenAccess`. The public batch
must still execute only after one successful low-value canary; the distinction is
sequencing rather than a time lock.

## X Layer snapshot and plan

Read at X Layer block `68733577`:

- operator `0xB6da8E6d497bd3Bc5016416DA57d177085449124`: nonce `13`, balance
  `60848010688350535` wei;
- Safe `0x08eea990F0b165A20d723e59517044a519C83351`: version `1.4.1`, owner
  `0xB6da8E6d497bd3Bc5016416DA57d177085449124`, threshold `1`, nonce `5`;
- registry `0xEf955cC592346e3b4cb8c7a67f3FE6B2c4688877`: owner is the Safe, unpaused,
  runtime hash `0x5de8b09ab2d521591020ccacace3eb18b42900ce7e300cf4aa31e634af14416d`;
- OKX target runtime hash `0x38e02cc6683c3fff0758aefa8b75189fd541ce1623cc9e6139de3119185f2a7f`;
- OKX spender runtime hash `0x69c96ed2d046e83e322c31cbc8c0943dbad47bc7cc31d1f8760921c47b0d7671`;
- V3 cumulative USDG input `11981648`; remaining `988018352` atomic;
- V3 cumulative USDt0 input `10909663`; remaining `989090337` atomic.

The exact unsigned plan is
[`general-asset-v4-xlayer-unsigned-plan.json`](./general-asset-v4-xlayer-unsigned-plan.json)
(SHA-256 `13482d50b1ce5cead9268d6a0135c5855be40408d83894553d8d420b0c59e350`).
It predicts risk manager `0xE399a72B7d0fEF974e868582671D4c7a23d37637` at nonce `13` and
Executor V4 `0xa3370D2719e670B46682bcC8f7Fae2f36797b66D` at nonce `14`.

The uploadable initial Safe batch is
[`general-asset-v4-xlayer-safe-proposal.json`](./general-asset-v4-xlayer-safe-proposal.json)
(SHA-256 `1ab45acf6426bb13f978fe410423509084db91291281da540eb03df7669f65eb`,
Safe checksum `0x03a75102eccfdbd3512de9a26d60ef80387100d693f05a07ddadcc09367098ec`).
It contains exactly four calls: reduce the V4 migration cap to `$48,000`, propose the
OKX permission, propose the canary wallet, and propose unpause. It is valid only after
both predicted contracts are deployed and their constructor/code read-back succeeds.

The following uploadable files are future-only and must not be executed with the initial
proposal:

- [`general-asset-v4-xlayer-safe-activation.future.json`](./general-asset-v4-xlayer-safe-activation.future.json)
  after the first 48-hour delay and proposed-state verification;
- [`general-asset-v4-xlayer-safe-open-proposal.future.json`](./general-asset-v4-xlayer-safe-open-proposal.future.json)
  only after a successful canary;
- [`general-asset-v4-xlayer-safe-open-activation.future.json`](./general-asset-v4-xlayer-safe-open-activation.future.json)
  after the separate public-open 48-hour delay.

The first delay starts when the initial Safe proposal batch executes onchain, not when
these files are generated, committed, or uploaded.

## Open-execution replacement

The verifier-authoritative multi-call implementation changes the Executor V4 runtime.
The superseded executor runtime hash is
`0xa844f5635fc7206cb9231d15a92f4d2519ffcb5c0f35c2cedd7ed7d2ae291a3f`; the reviewed
replacement artifact hash is
`0xaeb8e231f67b79e29c92c2581a11bc56667f59fcec19a01e86a00b264695afc6`.
The deployed executor and its risk manager therefore remain paused and must not be
activated. The old activation and open-access future batches are superseded and must not
be executed.

At X Layer block `68820262`, the operator nonce was `16` and its balance was
`60747713443335673` wei. The refreshed V3 remaining atomic capacities were `988012883`
USDG and `987885822` USDt0. The replacement migration input is
[`general-asset-v4-xlayer-replacement-migration.json`](./general-asset-v4-xlayer-replacement-migration.json).

The signer-free replacement plan is
[`general-asset-v4-xlayer-replacement-unsigned-plan.json`](./general-asset-v4-xlayer-replacement-unsigned-plan.json)
(SHA-256 `28914dc61a6d813abfcf265bd898afda2aae995423c25a160fb5974545e71831`).
Independent CREATE-address derivation predicts RiskManager V2
`0x13B9070f2d52812bFFB7CD7358653c741AbF5F40` at nonce `16` and Executor V4
`0xFcb59964fD41E9C097a28F02E13854Df0a26A44E` at nonce `17`.

The replacement plan intentionally uses
[`general-asset-v4-empty-plugins.json`](./general-asset-v4-empty-plugins.json): exact-call
programs are admitted by pinned target and spender runtime hashes plus verifier policy,
not by registry membership. Optional semantic plugins may still be registered for faster
route construction and stronger protocol-specific verification. The replacement risk
manager starts paused and allowlisted; a new Safe proposal, delay, canary, and separate
public-open delay remain mandatory after deployment read-back.

The replacement creations executed successfully and their transaction inputs match the
unsigned plan byte-for-byte:

- RiskManager V2: transaction
  `0xbca00012dd5bced57772ebdcfabe2d2344c7c01e6875b7a3682eee961c3c8394`,
  block `68825953`, input hash
  `0xfda7d72f4e6624d0e7eb6a0e08f36596def3f9bad8f63d3e86acd8ae8e2147d6`, runtime hash
  `0xb02d509cd26048642ee1c4eeaaba481db05e65130b90be64567f498ddddf96cb`;
- Executor V4: transaction
  `0xe1ecae784819b2fceb1d52473cba7022372cb8a2ee178a4e5ae25eccaf6eefbc`,
  block `68825959`, input hash
  `0x9e4259f1dbd2a866b3158a900bc6674fb627b942f511ee796c392f88455ce01c`, runtime hash
  `0x93ddb1f1d2975a4e4ff8a4d118e67b8623e511e63bf20f412de6032b2b8818e1`.

Read-back at block `68826127` confirmed the Safe is version `1.4.1`, threshold `1`,
nonce `6`, and owned only by the operator. The replacement risk manager is owned by that
Safe, bound to the replacement executor and canonical verifier, paused, allowlisted, and
still has its default `$1,000` route, `$5,000` wallet, and `$50,000` protocol limits.
The executor is bound to the expected registry and replacement risk manager.

The uploadable replacement proposal is
[`general-asset-v4-xlayer-replacement-safe-proposal.json`](./general-asset-v4-xlayer-replacement-safe-proposal.json)
(SHA-256 `7598e2f200a82c8da701c895ee0ae4b72c178e9d8ea8e8465158aefb89e7ca59`,
Safe checksum `0xe87874ee06343634ee9785c2b91a7393477d44f77a89aae5a4f89628e5a31e42`).
At the operator's explicit direction, it retains the deployed contract's `$50,000` V4
protocol cap instead of applying the earlier cross-version migration partition. It contains
exactly two zero-value calls to the replacement risk manager: propose the canary wallet and
propose unpause. The `$1,000` route and `$5,000` wallet caps remain unchanged. The batch has
executed in transaction
`0xff382b51c0bbd509e992cabdb50f6e27714b63ae717abc316725a0e29486604e`
at block `68826586` (`2026-08-24T18:20:22Z`). The Safe nonce advanced from `6` to `7`.
Both proposals mature at `2026-08-26T18:20:22Z`; V4 remains paused and the canary remains
inactive until a separately confirmed activation transaction executes after that time.

The signer-free proposed-state check passed at block `68826872` with zero plugin
permissions. Its pinned inputs are
[`general-asset-v4-xlayer-replacement-proposed-state.json`](./general-asset-v4-xlayer-replacement-proposed-state.json).
The replacement governance batches are:

- [`general-asset-v4-xlayer-replacement-safe-activation.future.json`](./general-asset-v4-xlayer-replacement-safe-activation.future.json),
  SHA-256 `96c3e7647e0e760d8bfe3e3166839ef8a64dfdfe416fefa6b24e2e9092b3c1c8`,
  Safe checksum `0xa51aa2e4bc68867fecb88333d831de9fd49baf821bd5659d4098ea71781ec6a3`;
- [`general-asset-v4-xlayer-replacement-safe-open-proposal.json`](./general-asset-v4-xlayer-replacement-safe-open-proposal.json),
  SHA-256 `21577126e688f2b1ce04e1b06a0322ad2797ee2cf5269f1d95bc1a4515bf2956`,
  Safe checksum `0xd4fb3f8f34dfd1392f1d500ec1bdcbd3ceede259eace259db0fea21de8910377`;
- [`general-asset-v4-xlayer-replacement-safe-open-activation.future.json`](./general-asset-v4-xlayer-replacement-safe-open-activation.future.json),
  SHA-256 `1ebe1f4d756b109198b11460fbebd2458eb6ab1918144c1a5eb63cb4104e1604`,
  Safe checksum `0x355bebdcceb1871c99182019ece7b75819f68f80fb16a815669c22087525b2a1`.

The public proposal executed in transaction
`0x924a23575d7c17d77db9bd0c7d3a8825ee91f7321e5854cc31b5fb18cb36e8f3`
at block `68827478` (`2026-08-24T18:35:14Z`), advancing the Safe nonce from `7` to `8`.
Public activation becomes eligible at `2026-08-26T18:35:14Z`, fifteen minutes after the
canary activation gate. Public access remains off until the future open-activation batch is
separately confirmed after a successful canary.
An independent proposed-state read-back at block `68827821` confirmed both pending timers,
the paused allowlist state, the canary wallet proposal, and the replacement runtime hashes.

The activation file contains exactly `activateWallet(canary)` and `activateUnpause()` and
must not execute before the first maturity time. The open-activation file remains future-only.
The application status binding is
[`general-asset-v4-xlayer-replacement-runtime-config.json`](./general-asset-v4-xlayer-replacement-runtime-config.json);
installing it exposes the replacement contract's real countdown but cannot bypass its
paused or allowlist state.

## Executed initial X Layer stage

The reviewed deployments executed successfully:

- RiskManager V2: transaction
  `0xa0dec0a4593b008e054e09f0c5c4d29724bd7f611d143b259904e9831b496893`,
  block `68735734`, contract `0xE399a72B7d0fEF974e868582671D4c7a23d37637`;
- Executor V4: transaction
  `0x6caa5b6fd6c7dc52d854e41c4b65be0716000946a9113af556dded318295a7ac`,
  block `68735742`, contract `0xa3370D2719e670B46682bcC8f7Fae2f36797b66D`.

The initial four-call Safe batch executed in transaction
`0x127a2fc911cbc590cba13d425386692fc494e2eac7114cc8aa951bc626cffb9d`
at block `68736333` (`2026-08-23T17:16:09Z`). Adapter, canary-wallet, and unpause
activation become eligible at `2026-08-25T17:16:09Z`. The pinned proposed-state
spec is [`general-asset-v4-xlayer-proposed-state.json`](./general-asset-v4-xlayer-proposed-state.json).
The public, signer-free web runtime binding is
[`general-asset-v4-xlayer-runtime-config.json`](./general-asset-v4-xlayer-runtime-config.json).
At this stage V4 remains paused, the adapter and canary wallet remain inactive, open
access remains unproposed, and V3 remains unchanged.

## Ethereum snapshot and sequencing blocker

At Ethereum block `25819061`, the operator nonce and balance were both `0`, and the
planned Safe, registry, and verifier addresses had no code. The reviewed OKX target and
spender hashes matched the manifest. The deterministic sequence is nonce `0` Safe factory,
nonce `1` registry, nonce `2` RiskManager V2, and nonce `3` Executor V4. Ethereum requires
gas funding plus Safe/registry deployment and read-back before any Safe batch is usable.

Immediately before any external action, re-read the chain ID, canonical block, deployer
nonce/balance, all runtime hashes, Safe owner/threshold/nonce, registry owner/paused state,
and V3 cumulative inputs. Any drift invalidates the affected unsigned plan or batch.
