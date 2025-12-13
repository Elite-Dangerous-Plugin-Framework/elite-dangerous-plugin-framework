# Getting Started for Plugin Devs

This is a high-level overview of what a plugin is, how it's defined, built and loaded.


![A high-level overview of how Plugins are structured](./highlevel-overview.drawio.svg)

EDPF lets you load Plugins. Plugins are defines as JS Web Components. The Frontend loads your Web Component by [importing your Plugin asynchronously at runtime](https://javascript.info/modules-dynamic-imports).
Your Web Component gets instantiated and notified by EDPF about Journal changes, which your Web Component can then act upon by changing the UI, doing API Calls, and so on. EDPF exposes all your assets via a Server.


## FAQ
### What do I need to write a plugin?
In short, all you need is an `index.js` File that exports a `default class SomeName` that extends `HTMLElement` and defines a `initPlugin(ctx)` method and a `manifest.json` that declares your plugin. That is all. How you get build the Web Component, is up to you. Want to keep it simple and just use JS directly? That's fine. Want to go all out and use all the Frontend frameworks under the sun, Unit Tests, I18n, Libraries, …? That's also fine. As long as you can throw your stack into a Web Component, it will work.

### Where should I best start?
It's probably best to start looking at one of the [template projects](#quickstart-templates) below. 

### How does my Plugin receive Journal data?
Your Web Component must expose an `initPlugin(ctx)` Method. Via this Method, your Plugin gets a Context provided. You can then register a callback with this context to be notified when a new journal item it found.
Note that journal entries are provided as strings due to JS handling all numbers as floats, which causes precision issues for IDs. 

We have a helper-library provided via [`@elite-dangerous-plugin-framework/journal`](https://www.npmjs.com/package/@elite-dangerous-plugin-framework/journal) which gives you autocompletion for all events and the option to use BigInts for Numbers (if you need correct IDs) or just regular `number`s (if you don't care about IDs, easier to work with).

### I have assets (pictures, fonts, stylesheets, …) - how can I load them
Assets are loaded from a locally running asset server. Use the readonly `baseUrl` property on the context and append the file name. Note that everything places in the `frontend` folder is exposed via this asset server. 
E.g. if you want to load a stylesheet for your plugin, you can reference it like `<link rel="stylesheet" href={ctx.assetsBase + "style.css"} />`.

## What is a plugin?

A plugin is defined by essentially 2 components - a _Plugin manifest_ and a _Javascript Bundle_.

The **Manifest** tells you what the Plugin does, what permissions it needs, how it should be updated, as well other various metadata like where to report bugs.

The **Javascript Bundle** contains the actual View that will be shows an a plugin. It's an ES-Module that _must_ have a default export which _must_ export a class definition that inherits from `HTMLElement`, essentially making it a Web-Component definition. The ES-Module _can_ also export a `settings` property. This is also a class inheriting `HTMLElement`. If present, it is assumed that your Plugin has Settings and will show up in the Settings Panel.  
Additionaly, besides the Bundle a plugin may define assets like Audio Files, Pictures, and so on.

Generally, a plugin is structured as follows:

```yaml
# the folder name - *should* relate to the plugin, but doesn't have to;
# the plugin name is taken from the manifest.json
× Your-Plugin-Name
  # the manifest file
  · manifest.json
  # the generated / bundled frontend. This is consumed by EDPF
  × frontend
    # the generated bundle. You *could* technically also place other JS files in here
    · index.js
    # you can place any further assets in here (e.g. stylesheets, pictures, …)
    # everything, including subfolders, is accessible to the Web Component
    # do note that you need to use a special helper function to resolve the Base-URL
    · ...
  # not strictly needed, just a convention to where the source-files should go
  × frontend-src
    · ... # your source files
```

Correctly loaded plugins can exist in 3 states:

- `visible`: The plugin has been added to the current view, meaning it shows up as a panel in the EDPF View. Note that plugins can exposes a specific property on their class to mark themselves as "invisible" - or not containing any UI. This is for example the case for the bundled `EDDN` plugin.
- `hidden`: The plugin is not visible, but still running! It still receives all the updates and events just like a regular plugin.
- `disabled`: The plugin was parsed correctly, but is currently not running. You can turn plugins on and off in the settings. Any newly added plugins start as disabled.

## Quickstart Templates

Below are project templates to start off your plugin. They start off simple and increase in complexity. Also take a look at the [Plugin Recipes](#todo) Page.
What we're trying to show with these templates is that EDPF is Framework-agnostic and that you can make your plugin building pipeline as simple or as complex as you like / need.

### Minimal

As simple as it gets. No fancy build tooling. Just a simple view which prints the last event type. This serves as a simple "Hello World" Plugin.

### Vite + TypeScript + Lit

Identical to [Minimal Hello World](#minimal-hello-world) in its featureset, except that this plugin brings an opinionated Build-Pipeline using [vite](https://vite.dev/guide/) to bundle and transpile [TypeScript](https://www.typescriptlang.org/). This template uses [Lit](https://lit.dev/), a minimal frontend framework built upon Web Components.

:::info
Note that you will need Node.js/npm or bun from this and subsequent templates.
:::

### Vite + TypeScript + React + TailwindCSS

Yet again a step up in complexity from the previous template, this template leverages [React](https://react.dev/) instead of Lit. This template also brings [TailwindCSS](https://tailwindcss.com/), a utility-first CSS-framework, into the mix.

### Vite + Vitest + TypeScript + React

This is a template showing how you can leverage [Vitest](https://vitest.dev/), a Testing Framework integrated with Vite.
