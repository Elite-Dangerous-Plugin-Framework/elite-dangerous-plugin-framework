import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

async function buildPlugins() {
  const PLUGINS_DIR = "src-tauri/assets/plugins";
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
}

async function buildPackages() {
  const pluginDirs = (
    await readdir("npm-packages", { withFileTypes: true })
  ).filter((e) => e.isDirectory());
  await Promise.all(
    pluginDirs.map(async (entry) => {
      const pluginRoot = join("npm-packages", entry.name);
      console.info(`\n▶ Building plugin: ${entry.name}`);
      await $`bun run build`.cwd(pluginRoot);
    })
  );
}

await buildPackages();
// plugins may depend on packages, so not done in parallel
await buildPlugins();
