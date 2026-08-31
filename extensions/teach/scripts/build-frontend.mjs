#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, cp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeBuildStamp } from "../src/frontend-build.ts";

/**
 * Builds the lesson page into dist/public. The built files are shipped, so
 * `/teach` never runs a build.
 *
 * After the build it writes a stamp of what the source looked like. `/teach` reads
 * that stamp to tell whether the shipped page still matches the source. Modified
 * times cannot answer that: a fresh clone rewrites them all to the same moment.
 */
const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDirectory = path.join(packageDirectory, "frontend");
const sharedDirectory = path.join(packageDirectory, "shared");
const publicDirectory = path.join(packageDirectory, "dist", "public");

/** The diagram editor's Chinese, Japanese and Korean handwriting fallback. */
const CJK_FONT_FAMILY = "Xiaolai";

const hasInstalledPackages = await access(path.join(frontendDirectory, "node_modules"))
  .then(() => true)
  .catch(() => false);

if (!hasInstalledPackages) {
  console.error(`Run "npm install --prefix frontend" in ${packageDirectory} first.`);
  process.exit(1);
}

const viteBinary = path.join(frontendDirectory, "node_modules", "vite", "bin", "vite.js");
const exitCode = await new Promise((resolve) => {
  const build = spawn(process.execPath, [viteBinary, "build"], {
    cwd: frontendDirectory,
    stdio: "inherit",
  });
  build.on("exit", (code) => resolve(code ?? 1));
  build.on("error", () => resolve(1));
});

if (exitCode !== 0) {
  process.exit(exitCode);
}

await copyDiagramEditorFonts();

const stamp = await writeBuildStamp({
  sourceDirectory: frontendDirectory,
  publicDirectory,
  extraSourceDirectories: [sharedDirectory],
});
console.log(`stamped the lesson page build: ${stamp.digest.slice(0, 12)}`);

/**
 * Puts the diagram editor's handwriting fonts in the shipped page.
 *
 * Excalidraw loads these at runtime and, left alone, falls back to a public content
 * delivery network. A lesson runs on the learner's own machine and must fetch nothing
 * from the internet, so the files are copied in and the page points Excalidraw at its
 * own address. The content security policy allows fonts from `'self'` only, so the
 * remote fallback could not succeed even if it were reached.
 *
 * The layout under `fonts/` has to be kept exactly: the font file names are written
 * into Excalidraw's own bundle.
 *
 * One family is left out by default. `Xiaolai` is the Chinese, Japanese and Korean
 * handwriting fallback and is 16 MB on its own — more than everything else in the
 * shipped page put together, in an artefact that is committed. Without it, text in
 * those scripts is drawn in the browser's own font instead of the handwriting one.
 * Set `TEACH_INCLUDE_CJK_DIAGRAM_FONT=1` to include it.
 */
async function copyDiagramEditorFonts() {
  const editorFonts = path.join(
    frontendDirectory,
    "node_modules",
    "@excalidraw",
    "excalidraw",
    "dist",
    "prod",
    "fonts",
  );
  const hasEditorFonts = await access(editorFonts)
    .then(() => true)
    .catch(() => false);

  if (!hasEditorFonts) {
    console.error(
      `The diagram editor's fonts are missing from ${editorFonts}. Run "npm install --prefix frontend".`,
    );
    process.exit(1);
  }

  const includeCjkFont = process.env.TEACH_INCLUDE_CJK_DIAGRAM_FONT === "1";
  const shippedFonts = path.join(publicDirectory, "fonts");
  await rm(shippedFonts, { recursive: true, force: true });

  const families = (await readdir(editorFonts, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => includeCjkFont || name !== CJK_FONT_FAMILY);

  for (const family of families) {
    await cp(path.join(editorFonts, family), path.join(shippedFonts, family), {
      recursive: true,
    });
  }

  console.log(
    `copied ${families.length} diagram editor font families into dist/public/fonts` +
      (includeCjkFont ? "" : ` (without ${CJK_FONT_FAMILY}, the 16 MB CJK fallback)`),
  );
}
