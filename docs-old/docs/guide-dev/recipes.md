# Plugin Recipes

This page contains little playbooks on how to add certain functionality to your plugin. This assume that you already have a Plugin you're working on. If that's not the case, take a look at [our plugin templates](./index.md#quickstart-templates).

## Settings

Each Plugin *can* expose Settings via a Web Component. To do so, the `index.js` File in should expose a class definition as `Settings`. The class *MUST* inherit from `HTMLElement` and *MUST* implement an `initSettings(ctx)` public method. EDPF will call this Method to pass you a Context. You may use the context to read and write settings, fetch the baseURL to load assets, and to get your plugin's manifest.

You can use `elite-dangerous-plugin-framework/core` 

## Internalization

Simplified to its basics, Internalization (i18n) is handled by convention with EDPF. 
If a plugin wants to support it, it can look at the `core.Locale` Setting. It is up to the plugin to handle fallbacks (e.g. to English).

