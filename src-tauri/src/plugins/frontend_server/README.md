# Plugin Frontend Server

Tauri does typically not support just random access to JS Modules on the File System. Besides that, we do not want the user to have to transpile the TypeScript to JavaScript.

For this reason we have a locally running Server that is started by the application that will
- transpile the well-known `$PLUGIN_DIR/frontend/index.tsx` into a a file, which is accessible via `[::1]:$PORT/plugins/$PLUGIN_ID.js`, and a source map served besides it.
- serve static assets which are places under `$PLUGIN_DIR/frontend/assets/**`, which is accessible via `[::1]:$PORT/plugins/$PLUGIN_ID/assets/**`. 
    > Note that plugins should use the `getAssetDir()` helper function to get the Base-URL to the assets folder.