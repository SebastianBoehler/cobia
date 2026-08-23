# General Asset V4 release runbook

This runbook prepares and verifies V4 on Ethereum (`1`) and X Layer (`196`). The repository commands are signer-free: they print deployment data or read pinned chain state. They never broadcast, create a Safe proposal, activate access, move principal, or pause V3.

## Required reviewed inputs

For each chain, freeze a JSON adapter manifest containing only registered LI.FI, OKX, or semantic permissions:

```json
[{"adapterId":"0x...","target":"0x...","selector":"0x12345678","runtimeCodeHash":"0x..."}]
```

[`general-asset-v4-adapters.example.json`](./general-asset-v4-adapters.example.json) is a shape-only fixture; its placeholder identities are not production permissions.

Record the deployer and exact nonce, Safe owner, verifier, canary wallet, existing adapter registry, compiled `CobiaRiskManagerV2` and `CobiaExecutorV4` artifact hashes, and canonical RPC. Do not reuse a permission from the other chain without independently reading its target code hash.

Freeze a chain-specific migration file as well. Every listed V3 asset must be an exact
contract explicitly reviewed at `$1.00`, with its real decimals and conservative maximum
remaining cumulative capacity (`maxCumulative - cumulativeInput`). No ticker or live price
lookup is accepted. X Layer currently has two six-decimal V3 assets, USDG
(`0x4ae46a509f6b1d9056937ba4500cb143933d2dc8`) and USDt0
(`0x779ded0c9e1022225f8e0630b35a9b54be713736`), each with at most `1_000_000_000`
remaining atomic units (`$1,000`) before subtracting observed usage. A conservative
X Layer partition therefore sets V4 to at most `$48,000`; Ethereum may use `$50,000`
only while its V3 asset list is empty.

```json
{
  "chainId": 196,
  "combinedProtocolBudgetUsdE8": "5000000000000",
  "v4ProtocolCapUsdE8": "4800000000000",
  "v3Assets": [
    {"chainId":196,"token":"0x4ae46a509f6b1d9056937ba4500cb143933d2dc8","decimals":6,"fixedUsdE8PerToken":"100000000","maximumRemainingAtomic":"1000000000"},
    {"chainId":196,"token":"0x779ded0c9e1022225f8e0630b35a9b54be713736","decimals":6,"fixedUsdE8PerToken":"100000000","maximumRemainingAtomic":"1000000000"}
  ]
}
```

## 1. Produce unsigned plans

Run for both chain IDs:

```sh
pnpm executor:v4:plan -- --chain-id 1 --deployer 0x... --nonce 0 --owner 0x... --verifier 0x... --canary-wallet 0x... --registry 0x... --adapters ./ethereum-adapters.json --migration ./ethereum-migration.json
pnpm executor:v4:plan -- --chain-id 196 --deployer 0x... --nonce 0 --owner 0x... --verifier 0x... --canary-wallet 0x... --registry 0x... --adapters ./xlayer-adapters.json --migration ./xlayer-migration.json
```

Independently check predicted addresses, constructor bindings, bytecode, registry permissions,
the fixed `$1,000` route and `$5,000` wallet caps, and the printed V3/V4 partition. The sum
of maximum remaining V3 consumption and V4 rolling protocol exposure must not exceed
`$50,000` on either chain. Stop here until deployment is explicitly approved.

## 2. Deployment and proposal stop points

Deployment transactions require separate approval and an external signer. After deployment,
read back code and constructor bindings. Execute the printed V4 migration-cap reduction and
any separately reviewed V3 cap reductions as distinct immediate Safe risk-reduction actions;
never pause V3 during judging. Then separately propose adapter permissions, the canary wallet,
and unpause. The first 48-hour delay begins only when those proposals execute.

Create a chain-specific state spec from the actual receipts and code hashes. Include the V3
risk manager plus every fixed-dollar token and its expected remaining cumulative capacity.
The verifier reads V3 limits and consumed amounts at the same pinned block as V4 and rejects
the state if the partition exceeds `$50,000`. Verify the proposal state:

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

Public access requires a new Safe proposal (`proposeOpenAccess`), another 48-hour wait,
separate activation, and explicit approval. The plan prints both calls, but they must never
be submitted together. V3 remains live throughout both governance windows, canary, and
initial public monitoring. After activation:

```sh
pnpm executor:v4:verify open -- --spec ./ethereum-v4-state.json
pnpm executor:v4:verify open -- --spec ./xlayer-v4-state.json
```

Only after both public read-backs and application deployment verification may traffic move to V4. Pausing V3 is a final, separate Safe action after V4 monitoring demonstrates stable execution; this runbook does not authorize or perform it.
