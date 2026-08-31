#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describeMissingPrerequisites, inspectSetup } from "../src/setup-prerequisites.ts";

/**
 * Says whether this clone is ready to be installed with `pi install`. Run on its
 * own, or at the end of `npm run setup`.
 */
const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = await inspectSetup({ packageDirectory });

for (const check of checks) {
  console.log(`${check.satisfied ? "ok  " : "MISS"}  ${check.name}`);
}

const problem = describeMissingPrerequisites(checks, packageDirectory);
if (problem !== null) {
  console.error(`\n${problem}`);
  process.exit(1);
}

console.log(`\nReady. Install it with: pi install ${packageDirectory}`);
