export type PluginCurrentState =
    | "Disabled"
    | {
        Starting: {
            frontend_hash: string
            metadata: string[]
            [k: string]: unknown
        }
    }
    | {
        FailedToStart: {
            reasons: string[]
            [k: string]: unknown
        }
    }
    | {
        Running: {
            frontend_hash: string
            [k: string]: unknown
        }
    }
    | {
        Disabling: {
            [k: string]: unknown
        }
    }
/**
 * Each Plugin must have a `manifest.json` which describes the plugin, it's requirements, updating strategies, and so on.
 */
export type PluginManifest = {
    type: "v1alpha"
    [k: string]: unknown
}
export type PluginStateSource = "UserProvided" | "Embedded"

/**
 * Defines the current state of the plugin. Mainly used for reconciliation and for the Frontend to display all plugins / specific plugin
 */
export interface PluginState {
    current_state: PluginCurrentState
    manifest: PluginManifest
    plugin_dir: string
    source: PluginStateSource
    [k: string]: unknown
}
