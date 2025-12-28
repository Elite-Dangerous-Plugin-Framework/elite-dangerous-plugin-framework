import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";



console.info("Building Packages in npm-packages…")
const packageDirs = (
  await readdir("npm-packages", { withFileTypes: true })
).filter((e) => e.isDirectory());
await Promise.all(
  packageDirs.map(async (entry) => {
    const pluginRoot = join("npm-packages", entry.name);
    console.info(`\n▶ Building package: ${entry.name}`);
    await $`bun run build`.cwd(pluginRoot);
    console.info(`\n… Package done: ${entry.name}`);
  })
);

const PLUGINS_DIR = "src-tauri/assets/plugins";
console.info("Building plugins in " + PLUGINS_DIR)
const pluginDirs = (
  await readdir(PLUGINS_DIR, { withFileTypes: true })
).filter((e) => e.isDirectory());
await Promise.all(
  pluginDirs.map(async (entry) => {
    const pluginRoot = join(PLUGINS_DIR, entry.name);
    const frontendSrc = join(pluginRoot, "frontend-src");

    console.info(`\n▶ Building plugin: ${entry.name}`);
    await $`bun run build`.cwd(frontendSrc);
  })
);

