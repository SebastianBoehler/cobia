import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function vercelBuildSteps(environment) {
  const steps = [];

  if (environment.VERCEL_ENV === "production") {
    steps.push(["pnpm", ["exec", "drizzle-kit", "migrate"]]);
  }

  steps.push(["pnpm", ["exec", "next", "build"]]);
  return steps;
}

function runBuild(environment) {
  for (const [command, args] of vercelBuildSteps(environment)) {
    const result = spawnSync(command, args, {
      env: environment,
      stdio: "inherit",
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (import.meta.url === entrypoint) {
  runBuild(process.env);
}
