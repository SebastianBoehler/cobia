# General Asset V4 release runbook

This runbook prepares and verifies V4 on Ethereum (`1`) and X Layer (`196`). The repository commands are signer-free: they print deployment data or read pinned chain state. They never broadcast, create a Safe proposal, activate access, move principal, or pause V3.

## Required reviewed inputs

For each chain, freeze a JSON adapter manifest containing only registered LI.FI, OKX, or semantic permissions:

```json
[{"adapterId":"0x...","target":"0x...","selector":"0x12345678","runtimeCodeHash":"0x..."}]
```

[`general-asset-v4-adapters.example.json`](./general-asset-v4-adapters.example.json) is a shape-only fixture; its placeholder identities are not production permissions.

Record the deployer and exact nonce, Safe owner, verifier, canary wallet, existing adapter registry, compiled `CobiaRiskManagerV2` and `CobiaExecutorV4` artifact hashes, and canonical RPC. Do not reuse a permission from the other chain without independently reading its target code hash.

## 1. Produce unsigned plans

Run for both chain IDs:

```sh
pnpm executor:v4:plan -- --chain-id 1 --deployer 0x... --nonce 0 --owner 0x... --verifier 0x... --canary-wallet 0x... --registry 0x... --adapters ./ethereum-adapters.json
pnpm executor:v4:plan -- --chain-id 196 --deployer 0x... --nonce 0 --owner 0x... --verifier 0x... --canary-wallet 0x... --registry 0x... --adapters ./xlayer-adapters.json
```

Independently check predicted addresses, constructor bindings, bytecode, registry permissions, and the fixed USD-E8 caps: `$1,000` route, `$5,000` wallet rolling 24h, `$50,000` protocol rolling 24h. Stop here until deployment is explicitly approved.

## 2. Deployment and proposal stop points

Deployment transactions require separate approval and an external signer. After deployment, read back code and constructor bindings before separately approving Safe proposals for adapter permissions, the canary wallet, and unpause. The 48-hour delay begins only when those proposals execute.

Create a chain-specific state spec from the actual receipts and code hashes. Verify the proposal state:

```sh
pnpm executor:v4:verify proposed -- --spec ./ethereum-v4-state.json
pnpm executor:v4:verify proposed -- --spec ./xlayer-v4-state.json
```

Do not combine proposal and activation calls. Do not activate before the delay or if either chain fails read-back.

## 3. Canary

After separately approved activation calls, verify `canary` on both chains. Run only bounded canary intents with the named wallet. Every chain transaction remains owner-confirmed; receipt and bridge delivery must reconcile before the next stage.

```sh
pnpm executor:v4:verify canary -- --spec ./ethereum-v4-state.json
pnpm executor:v4:verify canary -- --spec ./xlayer-v4-state.json
```

Any identity, valuation, target-code, receipt, output, delivery, cap, or canonical-block mismatch stops release and leaves V3 unchanged.

## 4. Public opening

Public access requires a new Safe proposal (`proposeOpenAccess`), another 48-hour wait, separate activation, and explicit approval. The plan prints both calls, but they must never be submitted together. After activation:

```sh
pnpm executor:v4:verify open -- --spec ./ethereum-v4-state.json
pnpm executor:v4:verify open -- --spec ./xlayer-v4-state.json
```

Only after both public read-backs and application deployment verification may traffic move to V4. Pausing V3 is a final, separate Safe action after V4 monitoring demonstrates stable execution; this runbook does not authorize or perform it.
