/**
 * The one way this extension replaces a file on the learner's disk.
 *
 * Everything a lesson keeps — the lesson record, a copied reference, a drawn
 * picture — is read back by something else while the lesson runs, so a reader must
 * never see half a file. Writing to a neighbouring temporary file and renaming it
 * into place gives that: rename is atomic on the same filesystem, so a reader sees
 * either the old file or the whole new one.
 *
 * Three repositories had a private copy of this. One copy means one place where the
 * temporary name, the exclusive-create flag and the cleanup on failure are decided,
 * and one place a future durability change lands.
 */

import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

/** Enough randomness that two writers to one path cannot pick the same name. */
const TEMPORARY_NAME_BYTES = 6;

/**
 * Writes `content` to `filePath`, replacing whatever is there.
 *
 * The temporary file is created exclusively, so this never writes over another
 * writer's half-finished file, and it is removed when anything goes wrong, so a
 * failed write leaves nothing behind. The directory must already exist: making it
 * is the caller's decision, because only the caller knows what it is for.
 */
export async function writeFileAtomically(
  filePath: string,
  content: string | Uint8Array,
): Promise<void> {
  const temporaryPath = `${filePath}.${randomBytes(TEMPORARY_NAME_BYTES).toString("hex")}.tmp`;
  try {
    await writeFile(temporaryPath, content, { flag: "wx" });
    await rename(temporaryPath, filePath);
  } catch (cause) {
    await rm(temporaryPath, { force: true });
    throw cause;
  }
}
