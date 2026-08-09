import { Mppx } from "@okxweb3/mpp";
import { SaApiClient } from "@okxweb3/mpp/evm";
import { charge } from "@okxweb3/mpp/evm/server";
import { readOkxCredentials } from "../env";

export function createPaymentServer(realm: string, secretKey: string) {
  const credentials = readOkxCredentials();
  const saClient = new SaApiClient(credentials);
  return Mppx.create({
    methods: [charge({ saClient })],
    realm,
    secretKey,
  });
}
