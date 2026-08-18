import { promises as dns } from "node:dns";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { CommerceFetchV1, DnsResolverV1 } from "./discovery-broker";

export const nodeDnsResolverV1: DnsResolverV1 = async (hostname) => {
  const answers = await dns.lookup(hostname, { all: true, verbatim: true });
  return answers.map(({ address }) => address);
};

export const nodeCommerceFetchV1: CommerceFetchV1 = (input) => new Promise((resolve, reject) => {
  const url = new URL(input.url);
  const family = isIP(input.resolvedAddress);
  if (family !== 4 && family !== 6) {
    reject(new Error("Pinned commerce address is invalid"));
    return;
  }

  const request = httpsRequest({
    protocol: "https:",
    hostname: url.hostname,
    port: 443,
    path: `${url.pathname}${url.search}`,
    method: "GET",
    headers: input.headers,
    servername: url.hostname,
    lookup: (_hostname, options, callback) => {
      if (typeof options === "object" && options.all) {
        callback(null, [{ address: input.resolvedAddress, family }]);
      } else {
        callback(null, input.resolvedAddress, family);
      }
    },
  }, (response) => {
    const contentEncoding = response.headers["content-encoding"];
    if (contentEncoding && contentEncoding !== "identity") {
      response.destroy(new Error("Compressed commerce responses are not accepted"));
      return;
    }
    const declaredLength = Number(response.headers["content-length"] ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > input.maxBytes) {
      response.destroy(new Error("Commerce discovery response exceeds size limit"));
      return;
    }

    const chunks: Buffer[] = [];
    let bytes = 0;
    response.on("data", (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > input.maxBytes) {
        response.destroy(new Error("Commerce discovery response exceeds size limit"));
        return;
      }
      chunks.push(chunk);
    });
    response.on("end", () => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(response.headers)) {
        if (typeof value === "string") headers[key.toLowerCase()] = value;
        else if (Array.isArray(value)) headers[key.toLowerCase()] = value.join(",");
      }
      resolve({ status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks) });
    });
    response.on("error", reject);
  });

  request.setTimeout(input.timeoutMs, () => {
    request.destroy(new Error("Commerce discovery request timed out"));
  });
  request.on("error", reject);
  request.end();
});
