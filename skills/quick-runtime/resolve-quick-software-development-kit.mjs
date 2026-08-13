import { accessSync, constants, existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";

function executableOnPath(commandName, environment) {
  for (const pathDirectory of String(environment.PATH || "").split(delimiter).filter(Boolean)) {
    const candidatePath = resolve(pathDirectory, commandName);
    try {
      accessSync(candidatePath, constants.X_OK);
      return realpathSync(candidatePath);
    } catch {
      continue;
    }
  }
  return null;
}

export function resolveQuickSoftwareDevelopmentKitPath(environment = process.env) {
  if (environment.QUICK_SDK_PATH && existsSync(environment.QUICK_SDK_PATH)) {
    return realpathSync(environment.QUICK_SDK_PATH);
  }

  const quickBinary = executableOnPath("quick", environment);
  if (!quickBinary) throw new Error("The quick command is unavailable.");

  let searchDirectory = dirname(quickBinary);
  for (let directoryLevel = 0; directoryLevel < 6; directoryLevel += 1) {
    const candidatePath = join(searchDirectory, "dist", "sdk.mjs");
    if (existsSync(candidatePath)) return candidatePath;
    searchDirectory = dirname(searchDirectory);
  }
  throw new Error("Could not find the Quick software development kit near the quick command.");
}
