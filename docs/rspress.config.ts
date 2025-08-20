import * as path from "node:path";
import { defineConfig } from "rspress/config";
import { pluginIconify } from "rsbuild-plugin-iconify";
export default defineConfig({
  plugins: [
    pluginIconify({
      targetDir: "src/styles/icons", // Directory to save generated CSS
      includeSets: ["mdi-light", "material-symbols"], // Icon sets to include completely
      maxIconsPerSet: 200, // Max icons per included set
      maxTotalIcons: 1000, // Max total icons
      compress: true, // Apply compression
    }),
  ],
  root: path.join(__dirname, "docs"),
  title: "Elite: Dangerous Plugin Framework",
  icon: "/rspress-icon.png",
  logo: {
    light: "/rspress-light-logo.png",
    dark: "/rspress-dark-logo.png",
  },
  themeConfig: {
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/CMDR-WDX/elite-dangerous-plugin-framework",
      },
    ],
  },
});
