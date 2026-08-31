import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRATCH_DIRECTORY_PREFIX = "pi-teach-session-";

/**
 * A lesson runs on its own pi agent session, and that session needs a directory to
 * discover resources in. It is pointed at an empty scratch directory so the
 * learner's own extensions, skills and AGENTS.md files stay out of the lesson.
 *
 * The directory belongs to the lesson, so it goes away with the lesson. Left
 * behind, one would pile up in the temporary directory for every lesson ever run.
 */
export async function createTeachingScratchDirectory(): Promise<string> {
  // The real path is used so the session and the cleanup agree on one name even
  // where the temporary directory is reached through a symbolic link.
  const temporaryDirectory = await realpath(tmpdir());
  return mkdtemp(path.join(temporaryDirectory, SCRATCH_DIRECTORY_PREFIX));
}

/**
 * Never throws. It runs while a lesson is being closed, and a lesson that cannot
 * tidy up after itself must not turn that into a second failure.
 */
export async function removeTeachingScratchDirectory(directory: string): Promise<void> {
  try {
    await rm(directory, { recursive: true, force: true });
  } catch {
    // Nothing useful can be done here, and the operating system clears the
    // temporary directory on its own schedule.
  }
}
