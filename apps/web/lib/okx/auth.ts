import { createHmac } from "node:crypto";

export interface OkxCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

export interface OkxSignInput extends OkxCredentials {
  timestamp: string;
  method: "GET" | "POST";
  path: string;
  body?: string;
}

export type OkxHeaders = Record<
  | "Content-Type"
  | "OK-ACCESS-KEY"
  | "OK-ACCESS-PASSPHRASE"
  | "OK-ACCESS-SIGN"
  | "OK-ACCESS-TIMESTAMP",
  string
>;

export function signOkxRequest(input: OkxSignInput): OkxHeaders {
  const prehash = `${input.timestamp}${input.method}${input.path}${input.body ?? ""}`;
  const signature = createHmac("sha256", input.secretKey)
    .update(prehash)
    .digest("base64");

  return {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": input.apiKey,
    "OK-ACCESS-PASSPHRASE": input.passphrase,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": input.timestamp,
  };
}
