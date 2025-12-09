# Motivation

A great inspiration for EDPF is [Elite Dangerous Market Connector](https://github.com/EDCD/EDMarketConnector). EDMC started off as "just a Market Connector" which utilizes the Journal and Frontier's Companion API (cAPI) to push updates about System States and Markets to 3rd party tools via EDDN.

With it's plugin system, it also allowed users to extend its functionality far beyond just managing markets. You can find anything from Route Plotting -, Planetary Navigation - all the way to Colonization-Helpers.
While this plugin system is great for small and simple plugins, it gets cumbersome for the more complex tasks.

EDMC's reliance on Python and tkinter also makes development more complex, especially if you start to mix asynchronous tasks without `async`, threading, Python's module system, constraints on tkinter (e.g. only modifyable from the main thread) into the mix.

And this is where EDPF comes in. It's focus is to provide a robust and simple approach to creating, installing and using plugins. Connecting the markets and interacting with the cAPI are not a priority, at least not for now.

## Vision

Plugins in EDPF are made with TypeScript / JavaScript. Each Plugin is a Web-Component with defines the Plugin view. EDPF does not concern itself with what framework stack each plugin wants to pick.
All the plugin wants is for plugins to expose an ES-Module that contains the Web-Component. It's up the plugin developer to choose if they want to go as simple as a single JS file or if they want to use a Framework, SCSS, i18n, Typescript, and so on. It doesn't matter what they choose as long as they can put it into a Web-Component.

The "host" application is written with Tauri. Each plugin can be loaded in. At the start we will simply have a plugins directory like EDMC. But the future vision is to implement a plugin registry where 3rd party devs can publish their plugins to be easily searched, installed and updated directly from within EDPF.

A key part of the vision also is that Plugins may be started and stopped at will. No need to completely restart the host app like with EDMC.
