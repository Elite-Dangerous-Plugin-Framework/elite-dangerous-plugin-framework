import { useEffect, useRef, useState } from "react";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { PluginState, PluginStateZod } from "../types/PluginState";
import { getAllPluginStates } from "../commands/getAllPluginStates";
import z from "zod";
import { listen } from "@tauri-apps/api/event";
import { Header } from "./Header";
import { startAndLoadPlugin } from "./startAndLoadPlugin";
import PluginsManager from "./PluginsManager";

function App() {
  const rootTokenRef = useRef<string>();
  const updatePluginIdsBufferRef = useRef<Record<string, null>>({});
  const updatePluginIdsDebouncerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const [appWin, setAppWin] = useState<Window>();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const pluginManagerRef = useRef<PluginsManager>();

  /// Contains the current plugin state and the plugin that was just updated. If undefined, we assume initial startup
  const [[pluginStates, updateIDs], setPluginStates] = useState<
    [Record<string, PluginState>, string[] | undefined]
  >([{}, undefined]);

  useEffect(() => {
    PluginsManager.register();
    if (pluginManagerRef.current) {
      return;
    }
    const manager = new PluginsManager();
    manager.dataset["mode"] = isEditMode ? "edit" : "default";
    pluginManagerRef.current = manager;
    document.getElementById("main-window")!.appendChild(manager);
  }, []);

  useEffect(() => {
    pluginManagerRef.current!.dataset["mode"] = isEditMode ? "edit" : "default";
  }, [isEditMode]);

  useEffect(() => {
    const win = getCurrentWindow();
    setAppWin(win);
    win.isMaximized().then((e) => setIsMaximized(e));
    getAllPluginStates().then((e) => setPluginStates([e, undefined]));

    const unlisten = listen("core/plugins/update", (ev) => {
      console.log(ev.payload);
      const resp = z
        .object({ id: z.string(), pluginState: PluginStateZod })
        .parse(ev.payload);
      // we debouce this because otherwise we drop events in case we get many updates in quick succession (e.g. reconcile)
      updatePluginIdsBufferRef.current[resp.id] = null; // discount hashset
      if (updatePluginIdsDebouncerRef.current !== null) {
        clearTimeout(updatePluginIdsDebouncerRef.current);
      }
      updatePluginIdsDebouncerRef.current = setTimeout(async () => {
        const state = await getAllPluginStates();
        updatePluginIdsDebouncerRef.current = null;
        const updatedPluginIDs = Object.keys(updatePluginIdsBufferRef.current)
        setPluginStates([state, updatedPluginIDs]);

        updatePluginIdsBufferRef.current = {};
      }, 100);
    });

    invoke("get_root_token_once").then((e) => {
      const response = z
        .object({ success: z.literal(true), data: z.string() })
        .or(z.object({ success: z.literal(false), reason: z.string() }))
        .parse(e);
      if (!response.success) {
        if (rootTokenRef.current === undefined) {
          console.error(
            "critital error: root token was already requested, the main App cannot acquire it. Please restart EDPF."
          );
          return;
        } else {
          console.info(
            "root token was already requested, but we already have a reference."
          );
        }
      } else {
        rootTokenRef.current = response.data;
        console.log("root token was inserted");
      }
    });

    return () => {
      unlisten.then((e) => e());
    };
  }, []);

  useEffect(() => {
    for (const item of Object.entries(pluginStates).filter(
      (e) => updateIDs === undefined || updateIDs.includes(e[0])
    )) {
      const [pluginID, pluginState] = item;
      if ("Starting" in pluginState.current_state) {
        // Do reconciliation for Starting
        startAndLoadPlugin(pluginID, rootTokenRef, pluginManagerRef.current!);
      }
      if ("Disabling" in pluginState.current_state) {
        (async () => {
          // Do reconciliation for Disabling
          if (pluginManagerRef.current?.loadedPluginsLookup[pluginID]) {
            const data = pluginManagerRef.current.loadedPluginsLookup[pluginID];
            if (data.type === "Running" && !!data.ref) {
              data.ref.remove();
              data.ref = undefined;
            }
          }
          await invoke("finalize_stop_plugin", { pluginId: pluginID });
          return;
        })();
      }
    }
  }, [pluginStates, updateIDs]);

  return (
    <main
      id="main-window"
      className="bg-slate-950 min-h-[100vh] text-white flex flex-col group"
    >
      <Header
        appWin={appWin}
        isMaximized={isMaximized}
        setIsMaximized={setIsMaximized}
        isEditMode={isEditMode}
        toggleEditMode={() => setIsEditMode(!isEditMode)}
      />
      {/** On init plugins are placed in the plugins staging ground. The plugins-manager is notified out this node */}
      <div id="plugins-staging-ground" className="hidden" />
      {/** note that we don't use React for the plugins section, but plain old JavaScript and DOM Manipulation
       * This is because React will not safely *move* HTML Elements between Nodes, and instead delete and recreate them.
       * It's easier (and mostly safer!) to just have all things Plugins be managed by our own Custom Element
       */}
    </main>
  );
}

export default App;
