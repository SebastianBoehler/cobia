import { getWalletAuthRepository } from "./market";
import { readWalletAuthSecret } from "../env";
import { walletAuthClientKey as hashClientKey } from "../wallet-auth/http";
import { createWalletAuthService } from "../wallet-auth/service";

let service: ReturnType<typeof createWalletAuthService> | undefined;

export function getWalletAuthService() {
  service ??= createWalletAuthService(getWalletAuthRepository());
  return service;
}

export function walletAuthClientKey(request: Request) {
  return hashClientKey(request, readWalletAuthSecret());
}
