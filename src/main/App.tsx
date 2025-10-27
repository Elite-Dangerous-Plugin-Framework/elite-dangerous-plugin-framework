import { useEffect, useRef, useState } from "react";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import z from "zod";
import { Header } from "./Header";
import PluginsManager, {
  PluginStateContainingCurrentStateZod,
} from "./PluginsManager";
import { AnyNodeZod, PluginViewStructureZod } from "./layouts/types";
import { invoke } from "@tauri-apps/api/core";
import VerticalLayout from "./layouts/VerticalLayout";
import { ChevronUp } from "../icons/parkingLot";
import PluginCell from "./layouts/PluginCell";
import { PluginStateCtx } from "./contexts/pluginStateContext";

// This function traverses all known plugins and returns the ones that are not found within the layout
function makePluginIdsInParkingLot(
  pluginIds: string[] | undefined,
  layout: z.infer<typeof PluginViewStructureZod> | undefined
) {
  if (typeof pluginIds === "undefined" || typeof layout === "undefined") {
    return undefined;
  }

  function returnIdsForLayout(layout: z.infer<typeof AnyNodeZod>): string[] {
    switch (layout.type) {
      case "PluginCell":
        return [layout.plugin_id];
      case "VerticalLayout":
        return layout.children.flatMap((e) => returnIdsForLayout(e));
    }
  }
  // This is a lookup
  const knownIds = Object.fromEntries(
    returnIdsForLayout(layout.root).map((e) => [e, undefined])
  );
  const idsNotInLayout = pluginIds.filter((e) => !knownIds[e]);
  return idsNotInLayout.sort();
}

function App() {
  const [appWin, setAppWin] = useState<Window>();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isParkingLotExpanded, setIsParkingLotExpanded] = useState(false);
  const pluginManagerRef = useRef<PluginsManager>();
  const [pluginState, setPluginState] =
    useState<
      Record<string, z.infer<typeof PluginStateContainingCurrentStateZod>>
    >();
  const [layout, setLayout] =
    useState<z.infer<typeof PluginViewStructureZod>>();

  const pluginsInParkingLot = makePluginIdsInParkingLot(
    Object.keys(pluginState ?? {}),
    layout
  );
  console.log({ pluginsInParkingLot });

  useEffect(() => {
    if (!pluginManagerRef.current) {
      const manager = new PluginsManager();

      pluginManagerRef.current = manager;
      manager.init((x) => {
        console.log("RX new Plugin State", x);
        setPluginState(x);
      });
    }
    return () => {
      if (pluginManagerRef.current) {
        pluginManagerRef.current.destroy();
      }
    };
  }, []);
  useEffect(() => {
    invoke("sync_main_layout").then((e) => {
      const { data } = z.object({ data: PluginViewStructureZod }).parse(e);
      data.root.children.push();
      setLayout(data);
    });
  }, []);

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
      <PluginStateCtx.Provider value={pluginState}>
        {layout ? (
          <VerticalLayout layout={layout.root} editMode={isEditMode} />
        ) : (
          <p>Loading…</p>
        )}
        {isEditMode && (
          <div
            className={`bg-amber-400/20 fixed ${
              isParkingLotExpanded ? "bottom-0" : "-bottom-40"
            } w-full h-48 duration-200`}
          >
            <div className="flex flex-col h-full">
              <button
                onClick={() => {
                  setIsParkingLotExpanded(!isParkingLotExpanded);
                }}
                className={`h-8 flex flex-row items-center self-start cursor-pointer ${
                  isParkingLotExpanded ? "bg-green-800" : "bg-green-700"
                } rounded-tr-lg gap-1 px-2`}
              >
                <span className=" text-lg">Parking Lot</span>
                <ChevronUp
                  className={`w-8 h-8 duration-200 ease-in-out ${
                    isParkingLotExpanded ? "rotate-180" : ""
                  } `}
                />
              </button>
              <section
                id="parking-lot-inner"
                className="flex flex-row max-w-full overflow-x-scroll flex-1 bg-green-950"
              >
                {pluginsInParkingLot ? (
                  pluginsInParkingLot.map((e) => (
                    <PluginCell
                      layout={{
                        type: "PluginCell",
                        plugin_id: e,
                        meta: {
                          max_width: "200px",
                          min_width: "200px",
                          max_height: "100px",
                        },
                      }}
                      editMode={true}
                      key={e}
                      hideActionButton
                    />
                  ))
                ) : (
                  <span>Loading…</span>
                )}
              </section>
            </div>
          </div>
        )}
      </PluginStateCtx.Provider>
    </main>
  );
}

export default App;
