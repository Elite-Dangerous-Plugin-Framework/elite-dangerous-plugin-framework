#!/usr/bin/env bun
// not part of the source, this defines what's needed to build the plugin


import { $ } from "bun"
import { join } from "node:path"

const outputDir = join(import.meta.dir, "..", "frontend")
await $`rm -rf ${outputDir}`

await Bun.build({
  outdir: "../frontend",
  format: "esm",
  entrypoints: ["./index.tsx"],
  target: "browser",
  sourcemap: "external"
})

await $`tailwindcss --input style.css --output ${join(outputDir, "style.css")}`

