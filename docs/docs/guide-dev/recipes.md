# Plugin Recipes

This page contains little playbooks on how to add certain functionality to your plugin. This assume that you already have a Plugin you're working on. If that's not the case, take a look at [our plugin templates](./index.md#quickstart-templates).

## Settings

Your plugin will have it's own Settings-Page if it exports a `settings` property from it's module. This property must define a Web Component (→ be a class that inherits `HTMLElement`).

Each Plugin stores its Settigns using a Key-Value Store.

:::warning Casing matters!
We use the convention of **lowercase** keys from **private** fields and **uppercase** keys for **publicly readable** keys.

For example the selected theme is defined at `core.Theme`. It can be read (but not written) by other plugins.
:::

TODO

## Internalization

Internalization lets you define alternative texts based on the preferred language the user has selected. While you can "cook your own" Internalization-Functions, a mature and battle-tested implementation can be found

TODO

## Inter-Plugin-Communication

Plugins may communicate with each other over Tauri's Event System.

TODO
