#!/usr/bin/env bun

import { $ } from "bun"

await $`rm -rf dist`

await Bun.build({
  outdir: "dist",
  format: "esm",
  entrypoints: ["./src/index.ts"],
  target: "browser",
  sourcemap: "external"
})

await $`tsc --emitDeclarationOnly --outDir dist`

