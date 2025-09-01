//! This Module concerns itself with the *persistent* State outside of the Manifest that is user-configurable
//!
//! E.g. if a plugin is enabled, if the plugin has specific permissions defined (unused for now)
//! also if the Plugin is new / unknown

/// This contains the entire Configurable State for a plugin.
pub(crate) struct PluginSettings {
    /// If true, the Plugin is running. If false, it's not running
    pub(crate) enabled: bool,
    /// Defaults to false. The first time this plugin is discovered a popup is made, which will tell you about the Plugin's.
    pub(crate) already_known: bool,
}
