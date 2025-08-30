import { useEffect, useState } from "react";
import {
  CloseIcon,
  EditPlugins,
  FullScreenIcon,
  MinimizeIcon,
  SettingsIcon,
} from "./icons/navbar";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const [appWin, setAppWin] = useState<Window>();
  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    setAppWin(win);
    win.isMaximized().then((e) => setIsMaximized(e));
  }, []);

  return (
    <main className="bg-slate-950 min-h-[100vh] text-white flex flex-col group">
      <header
        data-tauri-drag-region
        className="flex justify-end gap-1 items-end group-hover:visible invisible cursor-move "
      >
        <button title="Open Settings" onClick={() => {
          invoke("open_settings")
        }} className="px-2 cursor-pointer hover:bg-white/10">
          <SettingsIcon className="w-6 h-6" />
        </button>
        <button title="Change Plugin Arrangement" className="px-2 cursor-pointer hover:bg-white/10">
          <EditPlugins className="w-6 h-6" editing={false} />
        </button>
        <div className="flex-1" />
        <button title="Minimize" className="px-2 cursor-pointer hover:bg-blue-900">
          <MinimizeIcon
            className="w-6 h-6"

            onClick={() => {
              if (!appWin) {
                return;
              }
              appWin.minimize()
            }}
          />
        </button>
        <button title="Maximize" className="px-2 cursor-pointer hover:bg-blue-900">
          <FullScreenIcon
            className="w-6 h-6"
            isMaximized={isMaximized}
            onClick={() => {
              if (!appWin) {
                return;
              }
              appWin.maximize().then(async () => {
                setIsMaximized(await appWin.isMaximized());
              });
            }}
          />
        </button>
        <button
          onClick={() => {
            if (!appWin) {
              return;
            }
            appWin.close();
          }}
          className="px-2 cursor-pointer hover:bg-red-900"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
      </header>
    </main>
  );
}

export default App;
