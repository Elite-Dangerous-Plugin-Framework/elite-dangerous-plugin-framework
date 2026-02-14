import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { $, cd, within } from "zx";

const PLUGINS_DIR = "src-tauri/assets/plugins";
console.info("Building plugins in " + PLUGINS_DIR);
const pluginDirs = (await readdir(PLUGINS_DIR, { withFileTypes: true })).filter(
  (e) => e.isDirectory(),
);
await Promise.all(
  pluginDirs.map(async (entry) => {
    const pluginRoot = join(PLUGINS_DIR, entry.name);
    const frontendSrc = join(pluginRoot, "frontend-src");

    console.info(`\n▶ Building plugin: ${entry.name}`);
    await within(async () => {
      await cd(frontendSrc);
      await $`npm run build`;
    });
  }),
);
