import type { JournalEventItemV1Alpha } from "./journalEvent.js";
import { PluginManifestV1AlphaWithId } from "./manifest.js";

/**
 * When subscribing to Listeners, you get back a function that you must invoke to stop listening.
 * It is the caller's responsibility to do so. 
 */
export type Destructor = () => void;

/**
 * This is the main object your Plugin interacts with EDPF
 *
 * You can subscribe to events, requests specific Procedures (e.g requesting entire current journal file) (based on what your permissions allow)
 */
export interface PluginContextV1Alpha {
  /**
   * ## Used to receive Journal Events
   *
   * Pass a callback into this method. The Callback will be invoked each time a Journal Event is received.
   *
   * Note that EDPF does Event batching, meaining you receive a List of Events if they happen in very quick succession.
   *
   * This can be called multiple times. On call, you get back a destructor that should be invoked to unregister.
   */
  registerEventListener(
    callback: (events: JournalEventItemV1Alpha[]) => void
  ): Destructor;

  /**
   * ## Used to block shutdown for cleanup tasks
   *
   * If your Plugin requires some form of cleanup / finalizing, register a shutdown listener here.
   * When stopping a Plugin, the Context will **wait up to a second** for you to finish cleanup.
   *
   * Cleanup is considered finished **when the Promise returns**. The callback is invoked once only
   *
   * This can be called multiple times. On call, you get back a destructor that should be invoked to unregister.
   */
  registerShutdownListener(callback: () => Promise<void>): Destructor;

  /**
   * ## Used to open a URL in the User's browser
   * 
   * Note that using a `<a href="…"/>` is not possible as that would cause In-Webview navigation. Instead, you have to instruct the OS to open the resource outside the webview.
   * This Command does just that. Do note that only the `http` and `https` protocols are supported. 
   * 
   * This action is considered a Safe action and is accessible to all plugins without additional permissions
   */
  openUrl(url: string): Promise<void>

  /**
   * ## Request a reread of the current Journal
   *
   * This will replay all open Journals (one per CMDR), which should get the plugin up to speed on the current state.
   *
   * @returns a mapping containing CMDR Names as the Key and the entire file's events until this point in time within the Batch.
   */
  rereadCurrentJournals(): Promise<Record<string, JournalEventItemV1Alpha[]>>;

  /**
   * This is useful for writing plugins in a more abstract manner. (e.g. not hardcoding settings keys).
   * The property exposes the Plugin Manifest
   */
  get pluginMeta(): PluginManifestV1AlphaWithId

  /**
   * Your Plugin is exposed via an asset server that is running on localhost. The Port is not stable. Use this readonly property to get the base URL.
   *
   * You can then append the path to the file, relative to the `frontend` folder. Do note that relative escapes out of the `frontend` folder are not supported.
   *
   * `assetsBase` has always a `/` as a suffix.
   */
  get assetsBase(): string;
}

/**
 * Interacting with EDPF beyond the usual receiving of journal events is done with the help of **Capabilities**.
 * 
 * There is a set of default capabilities that are deemed safe to use and sensible defaults. There are however also more complex cases that require more access to the user's system.
 * A plugin has to advertise its need to for these capabilities. It can do so via it's manifest file. 
 * 
 * When using non-standard capabilities, a User is prompted / warned the first time they try to run the plugin.
 */
export interface PluginContextV1AlphaCapabilities {
  /**
   * **Enabled by default**
   * 
   * always present, used to read and write settings.
   */
  get Settings(): PluginContextV1AlphaCapabilitiesSettings
}

export interface PluginContextV1AlphaCapabilitiesSettings {
  /**
 * ## Write a setting for this plugin
 *
 * You can also push settings outside the Settings UI. Use this function to write a key / value pair.
 *
 * This is what you should look out for:
 * - The key contains segments, separated by a dot (.)
 * - You need at least 2 Segments
 * - the first segment **MUST** be your plugin ID
 * - the last segment determines if this is a "public" setting. If it starts uppercase, it is readable by every plugin
 *    - `myPlugin.some.key` is private. Only your own plugin can read and edit it and get notified about it
 *    - `myPlugin.some.Key` is public. You can read and edit it, other plugins can read it
 */
  writeSetting<T>(key: string, value: undefined | T): Promise<undefined | T>;


  /**
   * ## Fetches a setting by Key.
   * See Docs for {@link writeSetting()} for key structure
   *
   * Return the setting if present, undefined if it doesnt exist.
   * Throws an error if you are not allowed to access this setting
   */
  getSetting<T>(key: string): Promise<T | undefined>;

  /**
 * ## Used to listen for Settings
 *
 * Any plugin may listen for its own and other plugins changing their settings
 *
 * Do note that only keys where the last segment starts with an **Uppercase** char will be propagated here, except if the setting key is from your own plugin. This only gives you the key. If you wish the get the value, you should invoke {@link getSetting}
 *
 * This function can be called multiple times. **Each call gives you back an unlistener. Invoke it for clean up**. Callbacks are cleaned up automatically on Plugin shutdown.
 *
 */
  registerSettingsChangedListener(
    callback: (key: string, value: unknown) => void
  ): Destructor;
}