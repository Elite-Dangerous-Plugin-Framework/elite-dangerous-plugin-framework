#!/usr/bin/env zx

// Used by CI to determine which version should be built. This will patch bundled plugin's and EDPF's versions
// The rules are pretty straightforward:

import { $ } from "zx";
import { writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { coerce } from "semver";
import { env } from "process";

// Are we tagged with a `v*` Tag?
// yes  => this is a tagged build. Strip the `v` and use the remainder for the version. (read further)
//  |- does it have a `-pre\d+` suffix?
//  |    |
//  |    |- yes => This is a `beta` release channel Item
//  |     \- no => This a `stable` release channel Item
//  |
//   \- no => This is a `dev` release channel Item. The Version is patch to contain the version noted in `tauri.conf.json`, followed by a `-dev-YYYY-MM-DD-HH-mm-ss+SHA` suffix.
//   This is why it's important to keep the version in the conf.json up to date!  ----^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Using these Taggings, X-dev < X-pre < X (regular build)

// Lets look at the "reason" for the push first
if (env["GITHUB_EVENT_NAME"] !== "push") {
  throw new Error(
    "invalid $GITHUB_EVENT_NAME. Expected `push`. Is this run outside a Github CI Step?",
  );
}

const tauriConfFilePath = join(
  import.meta.dir,
  "..",
  "src-tauri",
  "tauri.conf.json",
);

const builtAt = new Date().toISOString();
let channel: "dev" | "beta" | "stable";
let safeVersion: string;
const ref = env["GITHUB_REF"];
if (!ref) {
  throw new Error("$GITHUB_REF missing. Is this run outside a Github CI Step?");
}
if (ref.startsWith("refs/tags/v")) {
  safeVersion =
    coerce(ref.replace("refs/tags/v", "").replaceAll("\n", "").trim(), {
      includePrerelease: true,
    }) + "";
  const isPrerelease = safeVersion.includes("-pre");
  if (safeVersion.includes("+")) {
    safeVersion = safeVersion.split("+")[0];
  }
  channel = isPrerelease ? "beta" : "stable";
  await writeFile(
    tauriConfFilePath,
    patchVersion(await readFile(tauriConfFilePath, "utf-8"), safeVersion),
  );
} else if (ref.startsWith("refs/heads/")) {
  // We are building a dev build
  const hash = (await $`git rev-parse --short HEAD`.text())
    .replaceAll("\n", "")
    .trim();
  channel = "dev";
  const { version } = JSON.parse(await readFile(tauriConfFilePath, "utf-8"));
  safeVersion = coerce(version, { includePrerelease: false }) + "";
  const datesegment = builtAt.slice(2, 19).replace(/:/g, "-");
  safeVersion = `${safeVersion}-dev-${datesegment}+${hash}`;
} else {
  throw new Error(
    "invalid state. GITHUB_REF is not missing, but neither a refs/heads/, nor a refs/tags/v",
  );
}

// we write a file containing the relevant release channel for the next step
await writeFile(
  join(import.meta.dir, "..", ".GITHUB_RELEASE_CHANNEL"),
  channel,
  "utf-8",
);
await writeFile(
  join(import.meta.dir, "..", ".GITHUB_TAG_NAME"),
  channel === "dev" ? "" : "v" + safeVersion,
  "utf-8",
);
await writeFile(
  join(import.meta.dir, "..", ".GITHUB_TAG_PRERELEASE"),
  "" + (channel === "beta"),
  "utf-8",
);

/**
 * Hackily patch the version without adjusting the ordering in any way
 */
export function patchVersion(jsonText: string, newVersion: string) {
  const asJson = JSON.parse(jsonText);
  asJson.version = newVersion;
  asJson.bundle.windows.wix.version = newVersion.replace("-pre", ".");

  return JSON.stringify(asJson, undefined, 2);
}
