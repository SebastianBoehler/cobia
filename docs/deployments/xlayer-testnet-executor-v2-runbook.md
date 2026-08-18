# X Layer Testnet Executor V2 deployment runbook

This runbook records the independently verified chain `1952` eligibility
deployment. It grants no protocol or asset permission and remains paused.

## Committed identities

| Role | Address |
|---|---|
| Deployer and temporary owner | `0xB6da8E6d497bd3Bc5016416DA57d177085449124` |
| Verifier identity | `0x1667d3e9a37655600eb4ee56BD2F5BAddC49fed4` |
| Canary identity | `0x9Afbf85e52612A9922617aDdA9569e13f565de31` |

The temporary owner is the browser-controlled Cobia Operator. The deployment
tools never read a signing key. Do not substitute the chain-196 governance Safe:
that Safe is not currently evidenced as deployed on chain 1952.

## Safety profile

- chain ID must be exactly `1952` (`0x7a0`);
- no Aave, Curve, Uniswap, token, wallet, or other capability is proposed;
- the risk manager starts paused and allowlist-only;
- the fourth wallet-confirmed transaction pauses the adapter registry;
- there is no activation batch and no production send path; and
- every transaction is nonce-bound, zero-value, and separately shown by OKX
  Wallet before signing.

Chain 196 and chain 1952 are separate deployments even when an address string
happens to be identical.

## Prerequisites

1. Compile and test the exact contract artifacts with `pnpm contracts:test`.
2. Keep `XLAYER_TESTNET_RPC_URL` in the gitignored `apps/web/.env.local`.
3. For a future redeployment, fund the Cobia Operator on **X Layer Testnet**
   with testnet OKB for gas. The four committed gas caps total `6,286,432` gas.
   Use the [official X Layer testnet faucet](https://web3.okx.com/xlayer/faucet);
   testnet tokens have no cash value.
4. Select the Cobia Operator account in OKX Wallet and add/switch to X Layer
   Testnet. Never export a seed phrase or signing key.

## Generate the unsigned plan

```sh
pnpm --silent executor:testnet:plan \
  --deployer 0xB6da8E6d497bd3Bc5016416DA57d177085449124 \
  --nonce 0 \
  --owner 0xB6da8E6d497bd3Bc5016416DA57d177085449124 \
  --verifier 0x1667d3e9a37655600eb4ee56BD2F5BAddC49fed4 \
  --canary-wallet 0x9Afbf85e52612A9922617aDdA9569e13f565de31
```

At nonce `0`, the expected chain-1952 addresses are:

| Contract | Expected address |
|---|---|
| Adapter registry | `0xb0B2bd226b07cD2b83DB51306f12aa29a8Cbd1a5` |
| Risk manager | `0xEf955cC592346e3b4cb8c7a67f3FE6B2c4688877` |
| Executor V2 | `0x4029dD2e07f7951e52Fa67E64573B0e5DB3225ab` |

Regenerate the plan if the operator nonce changes.

## Wallet-confirmed deployment

```sh
set -a
source apps/web/.env.local
set +a
pnpm --silent executor:testnet:console
```

Open `http://127.0.0.1:4179`, connect the Cobia Operator, and independently
review each of the four confirmations. Stop on any chain, account, nonce,
receipt, or expected-address mismatch. Copy the final receipt evidence into a
local gitignored JSON file.

## Independent verification

```sh
set -a
source apps/web/.env.local
set +a
pnpm --silent executor:testnet:verify --evidence /absolute/path/to/receipts.json
```

The verifier reads chain 1952 directly and rejects altered creation input,
wrong sender/nonce/value/target, failed receipts, missing runtime code, wrong
owners or constructor bindings, an unpaused registry/risk manager, or a plan
commitment mismatch. It also rejects a supplied receipt block anchor if the
testnet reorgs before verification.

## Verified deployment evidence

Independent verification succeeded on 2026-08-18 after refreshing three
receipt anchors that changed during a short testnet reorg. The original mutable
anchors were rejected by the hardened verifier.

| Contract | Address | Transaction | Canonical block | Runtime code hash |
|---|---|---|---|---|
| Adapter registry | `0xb0B2bd226b07cD2b83DB51306f12aa29a8Cbd1a5` | `0x1de03a7e6c17c69632ef2a4198c1b6c4f378d1015e310bb8e989d49da82b019d` | `38582298` / `0x150946687aec7ba73c64330966c46d4c02360f4f2339bbc57fc6a7affc027700` | `0x5de8b09ab2d521591020ccacace3eb18b42900ce7e300cf4aa31e634af14416d` |
| Risk manager | `0xEf955cC592346e3b4cb8c7a67f3FE6B2c4688877` | `0x81058ca4f9e69056c090cd0c5384248685871ab13262dccc74d7a65fc50de99f` | `38582303` / `0x72b0948b900535433d870fbe8c430751cc6c41c6c5826e7a6a0effbb41b48852` | `0xc1797561f6b425e5ffcfcc92115b30b85be68ea5f0484d968d03261743867137` |
| Executor V2 | `0x4029dD2e07f7951e52Fa67E64573B0e5DB3225ab` | `0x68cff1d6bbba6b436d0be39cd91e772a811027519487a7fefe91d5bef81521a6` | `38582308` / `0x3a20112fe71007f976f3f1ca75bc259d6720ff2f17c5457f4c5686bbf07da1b2` | `0x8fa3b48a0db878b56da8fd71a61e4a83f262c3e7d619f5eed5d48de6addd7083` |

The registry pause transaction is
`0x9ec00298bdf4c386ba7fe7817aeeeb34fecde3916e50d03944678ede26d7189a`.
Its canonical block is `38582312` with hash
`0x8fb9fe4b24d119581587b5bb94b7819472bfd893ab9e65897859d887d726adfd`.
The verifier confirmed owner `0xB6da8E6d497bd3Bc5016416DA57d177085449124`,
verifier signer `0x1667d3e9a37655600eb4ee56BD2F5BAddC49fed4`, exact
registry/risk-manager/executor bindings, non-empty runtime code, and paused
registry and risk-manager state. A second independent verification at head block
`38582640` left the pause receipt more than 300 blocks deep and reproduced the
same canonical anchors and state.

## Public evidence

The approved X Layer post is live at
<https://x.com/Cobia_Web3/status/2089621568942981373>. It describes the solver
and independent-verifier boundary; it predates the completed testnet deployment.
