const READ_METHODS = new Set([
  "eth_chainid",
  "eth_getblockbynumber",
  "eth_getbalance",
  "eth_getcode",
  "eth_getlogs",
  "eth_gettransactioncount",
  "eth_getproof",
  "eth_getstorageat",
  "eth_call",
]);

export interface JsonRpcRequest {
  method: string;
  params: readonly unknown[];
}

function canonicalMethod(method: string): string {
  if (!/^[a-zA-Z_]+$/.test(method)) {
    throw new Error("RPC method is not available to coding agents");
  }
  return method.toLowerCase();
}

function pinnedBlockParam(method: string, params: readonly unknown[], block: string) {
  if (method === "eth_call") {
    if (params.length < 1 || params.length > 2) {
      throw new Error("Invalid eth_call parameters");
    }
    return [params[0], block];
  }
  if (["eth_getbalance", "eth_getcode", "eth_getstorageat", "eth_gettransactioncount"].includes(method)) {
    const addressParams = method === "eth_getstorageat" ? 2 : 1;
    if (params.length !== addressParams + 1) {
      throw new Error(`Invalid ${method} parameters`);
    }
    return [...params.slice(0, addressParams), block];
  }
  if (method === "eth_getblockbynumber") {
    if (params.length !== 2) throw new Error("Invalid eth_getBlockByNumber parameters");
    return [block, params[1]];
  }
  if (method === "eth_getlogs") {
    if (params.length !== 1 || !params[0] || typeof params[0] !== "object") {
      throw new Error("Invalid eth_getLogs parameters");
    }
    return [{ ...(params[0] as Record<string, unknown>), fromBlock: block, toBlock: block }];
  }
  if (method === "eth_getproof") {
    if (params.length !== 3 || !Array.isArray(params[1])) {
      throw new Error("Invalid eth_getProof parameters");
    }
    return [params[0], params[1], block];
  }
  if (method === "eth_chainid" && params.length !== 0) {
    throw new Error("Invalid eth_chainId parameters");
  }
  return [...params];
}

/**
 * Normalizes a sandbox RPC request into the pinned public-read subset.
 * It intentionally offers no send, signing, wallet, pending, or unpinned reads.
 */
export function pinReadOnlyRpcRequest(
  request: JsonRpcRequest,
  block: string,
): JsonRpcRequest {
  const method = canonicalMethod(request.method);
  if (!READ_METHODS.has(method)) {
    throw new Error("RPC method is not available to coding agents");
  }
  return { method, params: pinnedBlockParam(method, request.params, block) };
}
