When doing major, iterative changes to a plugin, it is best to remove the plugin from the internal set and instead develop it as an external plugin, then move the changes back.
This is because Tauri will stop and recompile if it finds any changes in its assets.
