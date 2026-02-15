#!/usr/bin/env sh
import { z } from "zod";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { stdout } from "node:process";

// This script is invoked by Github CI to generate a new GH Pages bundle containing the latest.json files for each release channel.

const ReleasesSchema = z.array(
  z.object({
    tag_name: z.string(),
    prerelease: z.boolean(),
    assets: z.array(
      z.object({
        browser_download_url: z.string(),
        content_type: z.string(),
        name: z.string(),
      }),
    ),
  }),
);

const data = ReleasesSchema.parse(
  await fetch(
    "https://api.github.com/repos/Elite-Dangerous-Plugin-Framework/elite-dangerous-plugin-framework/releases",
  ).then((e) => e.json()),
);

async function withLatestJson(
  item: z.infer<typeof ReleasesSchema>[number] | undefined,
) {
  if (!item) {
    return undefined;
  }
  const searchUrl = item.assets.find(
    (e) => e.name === "latest.json",
  )?.browser_download_url;
  if (!searchUrl) {
    return undefined;
  }
  const latest = await fetch(searchUrl).then((e) => e.json());
  return { ...item, latest, searchUrl };
}

const mostRecentStableRelease = await withLatestJson(
  data
    .filter((e) => !e.prerelease)
    .toSorted((a, b) => b.tag_name.localeCompare(a.tag_name))
    .find(() => true),
);
const mostRecentPrerelease = await withLatestJson(
  data
    .filter((e) => e.prerelease)
    .toSorted((a, b) => b.tag_name.localeCompare(a.tag_name))
    .find(() => true),
);

const sharedMostRecent = [mostRecentPrerelease, mostRecentStableRelease]
  .filter(Boolean)
  .toSorted((a, b) => b!.tag_name.localeCompare(a!.tag_name))
  .find(() => true);
if (!sharedMostRecent) throw new Error("No releases at all!");

let listItems = [];

const outDir = join(import.meta.dirname, "generated_jsons_dist");
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const publicUrlBase =
  "https://elite-dangerous-plugin-framework.github.io/elite-dangerous-plugin-framework/";

if (mostRecentStableRelease) {
  listItems.push(
    `<li><a href="${publicUrlBase}/stable.json">stable release</a></li>`,
  );
  await writeFile(
    join(outDir, "stable.json"),
    JSON.stringify(mostRecentStableRelease.latest),
  );
}
if (mostRecentPrerelease) {
  listItems.push(
    `<li><a href="${publicUrlBase}/prerelease.json">pre-release</a></li>`,
  );
  await writeFile(
    join(outDir, "prerelease.json"),
    JSON.stringify(mostRecentPrerelease.latest),
  );
}
if (sharedMostRecent) {
  listItems.push(
    `<li><a href="${publicUrlBase}/merged.json">merged</a> (stable or pre-release, whichever is newer)</li>`,
  );
  await writeFile(
    join(outDir, "merged.json"),
    JSON.stringify(sharedMostRecent.latest),
  );
}

let indexHtml = `<html>
  <head>
    <title>Elite: Dangerous Plugin Framework Update Index</title>
  </head>
  <body>
    <p>EDPF exposes the most recent version via this Environment. Below, you can find all available release channels</p>
    <ul>
      ${listItems.join("\n      ")}
    </ul>
  </body>
</html>`;

await writeFile(join(outDir, "index.html"), indexHtml);

stdout.write(outDir);
