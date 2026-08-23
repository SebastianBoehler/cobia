import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { authorized } from "./auth";
import { readReplayServiceConfig } from "./config";
import { replayAtPath } from "./replay";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const config = readReplayServiceConfig();
let active = 0;

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function body(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.from(chunk);
    size += value.length;
    if (size > MAX_BODY_BYTES) throw new Error("Replay request exceeds 2 MiB");
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    return json(response, 200, { ok: true, active, capacity: config.REPLAY_MAX_CONCURRENCY });
  }
  if (request.method !== "POST" ||
      !["/v1/replays/transaction", "/v1/replays/capability", "/v1/replays/asset-evidence",
        "/v1/replays/general-asset-stage"]
        .includes(request.url ?? "")) {
    return json(response, 404, { error: "not_found" });
  }
  if (!authorized(request.headers.authorization, config.REPLAY_SERVICE_SECRET)) {
    return json(response, 401, { error: "unauthorized" });
  }
  if (active >= config.REPLAY_MAX_CONCURRENCY) {
    return json(response, 503, { error: "replay_capacity_exhausted" });
  }
  active += 1;
  try {
    const input = await body(request);
    const result = await replayAtPath(request.url!, input, config);
    return json(response, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Replay failed";
    return json(response, 422, { error: "replay_failed", message });
  } finally {
    active -= 1;
  }
});

server.listen(config.PORT, "0.0.0.0", () => {
  process.stdout.write(`${JSON.stringify({ event: "replay-service-ready", port: config.PORT })}\n`);
});

function shutdown() {
  server.close((error) => process.exit(error ? 1 : 0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
