import type { AnyCapabilityModuleV1 } from "./module";

export interface CapabilityRegistryV1 {
  resolve(id: string, version: number): AnyCapabilityModuleV1;
  list(): readonly AnyCapabilityModuleV1[];
}

function moduleKey(id: string, version: number): string {
  return `${id}@${version}`;
}

export function createCapabilityRegistryV1(
  modules: readonly AnyCapabilityModuleV1[],
): CapabilityRegistryV1 {
  const entries = new Map<string, AnyCapabilityModuleV1>();
  for (const module of modules) {
    const key = moduleKey(module.id, module.version);
    if (entries.has(key)) throw new Error(`Duplicate capability module: ${key}`);
    entries.set(key, module);
  }
  const listed = Object.freeze([...modules]);
  return Object.freeze({
    resolve(id: string, version: number) {
      const module = entries.get(moduleKey(id, version));
      if (!module) throw new Error(`Unsupported capability: ${moduleKey(id, version)}`);
      return module;
    },
    list: () => listed,
  });
}
