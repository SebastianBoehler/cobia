export class ActiveManifestMismatchError extends Error {}

export function assertPolicyTargetsActiveManifest(
  policy: {
    manifestHash: string;
    allowedCapabilities: readonly { id: string; version: number }[];
  },
  manifest: {
    registryHash: string;
    capabilities: readonly { id: string; version: number }[];
  },
) {
  if (policy.manifestHash !== manifest.registryHash) {
    throw new ActiveManifestMismatchError("Signed intent targets an inactive capability manifest");
  }
  const active = new Set(manifest.capabilities.map(({ id, version }) => `${id}@${version}`));
  for (const capability of policy.allowedCapabilities) {
    if (!active.has(`${capability.id}@${capability.version}`)) {
      throw new ActiveManifestMismatchError(
        `Signed intent requests unsupported capability ${capability.id}@${capability.version}`,
      );
    }
  }
}
