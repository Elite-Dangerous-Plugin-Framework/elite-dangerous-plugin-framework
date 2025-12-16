import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

const PLUGINS_DIR = "src-tauri/assets/plugins";

async function run() {
  const pluginDirs = (await readdir(PLUGINS_DIR, { withFileTypes: true })).filter(e => !e.isDirectory());
  return Promise.all(pluginDirs.map(async entry => {
    const pluginRoot = join(PLUGINS_DIR, entry.name);
    const frontendSrc = join(pluginRoot, "frontend-src");

    console.info(`\n▶ Building plugin: ${entry.name}`);
    await $`bun ci`.cwd(frontendSrc)
    await $`bin run build`.cwd(frontendSrc)
  }))
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
