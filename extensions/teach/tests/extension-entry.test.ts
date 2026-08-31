import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { FakeCommandContext, FakeExtensionApi } from "./support/fake-extension-api.ts";

/**
 * These tests load the real entry point the way pi does, which catches a broken
 * import or a missing registration. Pi supplies its own packages at run time, so
 * when they are not linked in the tests report that instead of failing.
 * Run `node scripts/link-pi-packages.mjs` to link them.
 */
const piPackagesAreAvailable = await import("@earendil-works/pi-coding-agent").then(
  () => true,
  () => false,
);

describe("teach extension entry point", { skip: piPackagesAreAvailable ? false : "pi packages are not linked" }, () => {
  async function loadExtension(): Promise<{
    pi: FakeExtensionApi;
    lessonsDirectory: (agentDirectory: string) => string;
  }> {
    const entryPoint = await import("../src/index.ts");
    const pi = new FakeExtensionApi();
    entryPoint.default(pi as never);
    return { pi, lessonsDirectory: entryPoint.lessonsDirectory };
  }

  it("registers the teach command", async () => {
    const { pi } = await loadExtension();

    assert.equal(pi.commands.has("teach"), true);
  });

  it("describes the teach command for the command list", async () => {
    const { pi } = await loadExtension();

    assert.match(pi.commands.get("teach")?.description ?? "", /lesson/i);
  });

  it("registers cleanup for when the pi session ends", async () => {
    const { pi } = await loadExtension();

    assert.equal((pi.eventHandlers.get("session_shutdown") ?? []).length, 1);
  });

  it("starts no server and registers no tool just from being loaded", async () => {
    const { pi } = await loadExtension();

    assert.deepEqual(pi.registeredTools, []);
  });

  it("survives session shutdown when no lesson was ever opened", async () => {
    const { pi } = await loadExtension();

    await pi.emit("session_shutdown", { reason: "quit" });
  });

  it("keeps lessons under the teach folder of the pi agent directory", async () => {
    const { lessonsDirectory } = await loadExtension();

    assert.equal(lessonsDirectory("/home/someone/.pi/agent"), path.join("/home/someone/.pi/agent", "teach", "lessons"));
  });
});
