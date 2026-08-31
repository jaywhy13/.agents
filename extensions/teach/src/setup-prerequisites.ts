import { stat } from "node:fs/promises";
import path from "node:path";

import { inspectFrontendBuild } from "./frontend-build.ts";

export interface InspectSetupOptions {
  readonly packageDirectory: string;
}

export interface PrerequisiteCheck {
  readonly name: string;
  readonly satisfied: boolean;
  /** The exact command that puts this right. */
  readonly fix: string;
  readonly detail?: string;
}

/** One command that does everything below, in the right order. */
export const SETUP_COMMAND = "npm run setup";

/**
 * `pi install <path>` copies the extension in but installs nothing, so a fresh
 * clone has no `ws`, no Vite, no linked pi packages, and no built lesson page.
 * This says which of those are missing and exactly what to run.
 */
export async function inspectSetup(
  options: InspectSetupOptions,
): Promise<readonly PrerequisiteCheck[]> {
  const { packageDirectory } = options;
  const publicDirectory = path.join(packageDirectory, "dist", "public");

  const buildStatus = await inspectFrontendBuild({
    sourceDirectory: path.join(packageDirectory, "frontend"),
    publicDirectory,
    extraSourceDirectories: [path.join(packageDirectory, "shared")],
  });

  return [
    {
      name: "server dependencies",
      satisfied: await directoryExists(path.join(packageDirectory, "node_modules", "ws")),
      fix: "npm install",
      detail: "The lesson server speaks WebSocket through the ws package.",
    },
    {
      name: "lesson page dependencies",
      satisfied: await directoryExists(
        path.join(packageDirectory, "frontend", "node_modules", "vite"),
      ),
      fix: "npm install --prefix frontend",
      detail: "The lesson page is built with Vite.",
    },
    {
      name: "diagram editor fonts",
      satisfied: await directoryExists(path.join(publicDirectory, "fonts", "Excalifont")),
      fix: "npm run build:frontend",
      detail:
        "Diagrams are drawn in a handwriting font that is served from this machine, never fetched from the internet.",
    },
    {
      name: "pi packages",
      satisfied: await directoryExists(
        path.join(packageDirectory, "node_modules", "@earendil-works", "pi-coding-agent"),
      ),
      fix: "npm run link:pi",
      detail: "Pi supplies these at run time; they are linked in for tests and typechecking.",
    },
    {
      name: "built lesson page",
      satisfied: buildStatus.isBuilt && buildStatus.isFresh,
      fix: "npm run build:frontend",
      ...(buildStatus.staleReason === undefined ? {} : { detail: buildStatus.staleReason }),
    },
  ];
}

/** A message the learner can act on, or null when there is nothing to do. */
export function describeMissingPrerequisites(
  checks: readonly PrerequisiteCheck[],
  packageDirectory: string,
): string | null {
  const missing = checks.filter((check) => !check.satisfied);
  if (missing.length === 0) {
    return null;
  }

  const lines = [
    `The /teach extension is not set up: ${missing.map((check) => check.name).join(", ")}.`,
    `Run "${SETUP_COMMAND}" in ${packageDirectory}, then run /teach again.`,
  ];
  for (const check of missing) {
    lines.push(`  ${check.name}: ${check.fix}${check.detail === undefined ? "" : ` (${check.detail})`}`);
  }
  return lines.join("\n");
}

async function directoryExists(directory: string): Promise<boolean> {
  return stat(directory)
    .then((entry) => entry.isDirectory())
    .catch(() => false);
}
