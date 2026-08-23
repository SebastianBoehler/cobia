---
name: xlayer-uniswap-v3
description: Quote and construct pinned Uniswap V3 exact-input swap candidates on X Layer.
---

# X Layer Uniswap V3

Run the route tool `solve` command to verify pool identity, quote the exact
signed input at the pinned snapshot, and compare it with Curve when both are
eligible. Installed swap support is operator-declared discovery metadata.

The deterministic action binds the registered factory-derived pool, fee tier,
owner recipient, exact input, output floor, and zero price-limit override.
Exact-output or multi-hop calldata may be researched through the general EVM
lane, but must bind every hop and survive independent replay. Do not claim NFT
position support until the signed verifier model binds token ID ownership,
ticks, liquidity deltas, both token minima, and collect recipient.
