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
  const [appWin, setAppWin] = useState<Window>();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const pluginManagerRef = useRef<PluginsManager>();

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
  }, []);


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
