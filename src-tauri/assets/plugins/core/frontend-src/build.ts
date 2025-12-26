#!/usr/bin/env bun
// not part of the source, this defines what's needed to build the plugin


import { $ } from "bun"

await $`rm -rf ../frontend`

await Bun.build({
  outdir: "../frontend",
  format: "esm",
  entrypoints: ["./index.tsx"],
  target: "browser",
  sourcemap: "external"
})

await $`tailwindcss --input style.css --output ../frontend/style.css`

