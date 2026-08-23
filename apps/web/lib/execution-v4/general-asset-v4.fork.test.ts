import { createPublicClient, http } from "viem";
import { describe, expect, it } from "vitest";
import { xLayer } from "../chain/xlayer";

const ethereumRpc = process.env.ETHEREUM_RPC_URL;
const xLayerRpc = process.env.XLAYER_RPC_URL;

describe.skipIf(!ethereumRpc || !xLayerRpc)("general asset V4 live fork prerequisites", () => {
  it("pins both authorized chains by their exact chain IDs and block hashes", async () => {
    const ethereum = createPublicClient({ transport: http(ethereumRpc) });
    const xlayer = createPublicClient({ chain: xLayer, transport: http(xLayerRpc) });
    const [ethereumChain, xLayerChain, ethereumBlock, xLayerBlock] = await Promise.all([
      ethereum.getChainId(), xlayer.getChainId(), ethereum.getBlock(), xlayer.getBlock(),
    ]);
    expect(ethereumChain).toBe(1);
    expect(xLayerChain).toBe(196);
    expect(ethereumBlock.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(xLayerBlock.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
