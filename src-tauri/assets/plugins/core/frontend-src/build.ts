#!/usr/bin/env zx
// not part of the source, this defines what's needed to build the plugin

import { $ } from "zx";
import { join } from "node:path";
import { build } from "rolldown";

const outputDir = join(process.cwd(), "../frontend");
await build({
  input: "index.tsx",
  platform: "browser",
  output: {
    cleanDir: true,
    file: join(outputDir, "index.js"),
  },
  tsconfig: join(process.cwd(), "tsconfig.json"),
});

await $`tailwindcss --input style.css --output "${"../frontend/style.css"}"`;
