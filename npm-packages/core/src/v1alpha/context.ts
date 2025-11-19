import type { JournalEventItemV1Alpha } from "./journalEvent.js";

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
   * Note this can only **be called once**.
   */
  registerEventListener(
    callback: (events: JournalEventItemV1Alpha[]) => void
  ): void;

  /**
   * ## Used to block shutdown for cleanup tasks
   *
   * If your Plugin requires some form of cleanup / finalizing, register a shutdown listener here.
   * When stopping a Plugin, the Context will **wait up to a second** for you to finish cleanup.
   *
   * Cleanup is considered finished **when the Promise returns**. The callback is invoked once only
   *
   * Note this can only **be called once**.
   */
  registerShutdownListener(callback: () => Promise<void>): void;

  /**
   * ## Used to listen for Settings
   *
   * Any plugin may listen for its own and other plugins changing their settings
   *
   * Do note that only keys where the last segment start **Uppercase** will be propagated here, except if the setting key is from your own plugin
   *
   * Note this can only **be called once**.
   *
   */
  registerSettingsChangedListener(
    callback: (key: string, value: unknown) => void
  ): void;

  /**
   * ## Request a reread of the current Journal
   *
   * This will replay all open Journals (one per CMDR), which should get the plugin up to speed on the current state.
   *
   * @returns a mapping containing CMDR Names as the Key and the entire file's events until this point in time within the Batch.
   */
  rereadCurrentJournals(): Promise<Record<string, JournalEventItemV1Alpha[]>>;

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
  writeSetting(key: string, value: unknown): Promise<void>;

  /**
   * ## Fetches a setting by Key.
   * See Docs for {@link writeSetting()} for key structure
   *
   * Return the setting if present, undefined if it doesnt exist.
   * Throws an error if you are not allowed to access this setting
   */
  getSetting(key: string): Promise<unknown | undefined>;

  /**
   * Your Plugin is exposed via an asset server that is running on localhost. The Port is not stable. Use this readonly property to get the base URL.
   *
   * You can then append the path to the file, relative to the `frontend` folder. Do note that relative escapes out of the `frontend` folder are not supported.
   *
   * `assetsBase` has always a `/` as a suffix.
   */
  get assetsBase(): string;
}
