/**
 * Note: Permissions will be added as we go to cover more and more use cases. If there's something you need exposed for your plugin that is currently impossible, please don't hesitate to open an Issue
 */
export type PluginPermission = "JournalDirReadAnyJournals"
export type PluginRemoteManifestResolutionStrategy =
    | "GitReleaseAsset"
    | {
        Http: {
            address: string
            [k: string]: unknown
        }
    }
    | "OfficialRegistry"
    | {
        UnofficialRegistry: {
            address: string
            [k: string]: unknown
        }
    }

/**
 * Version 1alpha is the initial version that may introduce breaking changes.
 * Once the MVP is finished, this can be promoted to v1
 */
export interface PluginManifestV1Alpha {
    /**
     * A short description about what this Plugin is doing
     */
    description?: string | null
    /**
     * What is this plugin's name?
     * This name shouldn't change over time as the internal ID and plugin-stored settings are tied to it
     * The internal name is derived from this name by replacing spaces with dashes and removing any unsafe characters
     */
    name: string
    /**
     * each plugin has a default set of permissions like getting the current full journal, getting the Status.json, Backpack.json, etc. + anything a browser could do
     * some plugins might need additional permissions, e.g. File Read Access / Write Access
     */
    permissions?: PluginPermission[] | null
    /**
     * This contains the strategy the plugin should take during updating to find out if there is a new update
     */
    remote_manifest?: PluginRemoteManifestResolutionStrategy | null
    /**
     * optionally, a URL to the Git Repository
     */
    repository_url?: string | null
    /**
     * optionally, a link where the user can get support. Can be a Discord Link, Github Issues, etc.
     */
    support_url?: string | null
    /**
     * Put a semantic version here (e.g. `0.0.1`)
     */
    version?: string | null
    /**
     * A list of versions. This is ignored from the local file and only the remote manifest is considered. Look at [PluginManifest::remote_manifest]
     */
    versions?: PluginVersionOption[] | null
    [k: string]: unknown
}
export interface PluginVersionOption {
    /**
     * Contains the full path to a tar / tgz / zip which contains the entire plugin folder.
     */
    download_url: string
    /**
     * users may opt into beta releases to test new features
     */
    is_pre_release: boolean
    /**
     * A semantic version (e.g. 1.2.3)
     */
    version: string
    [k: string]: unknown
}
