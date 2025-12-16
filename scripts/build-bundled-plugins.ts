import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const PLUGINS_DIR = "src-tauri/assets/plugins";

async function run() {
  const plugins = await readdir(PLUGINS_DIR, { withFileTypes: true });

  for (const entry of plugins) {
    if (!entry.isDirectory()) continue;

    const pluginRoot = join(PLUGINS_DIR, entry.name);
    const frontendSrc = join(pluginRoot, "frontend-src");

    console.info(`\n▶ Building plugin: ${entry.name}`);

    await new Promise<void>((resolve, reject) => {
      const p = spawn("bun", ["run", "build"], {
        cwd: frontendSrc,
        stdio: "inherit",
      });

      p.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Build failed for ${entry.name}`));
      });
    });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
