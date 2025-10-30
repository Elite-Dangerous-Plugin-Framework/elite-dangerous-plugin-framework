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
import { ChevronUp, ParkingLotIcon } from "../icons/parkingLot";
import PluginCell from "./layouts/PluginCell";
import { PluginStateCtx } from "./contexts/pluginStateContext";
import { Active, DndContext, DragOverlay } from "@dnd-kit/core";
import { ParkingLotDropTarget } from "./layouts/DropTarget";

function traverseNode(
  el: z.infer<typeof AnyNodeZod>,
  containerId: string
): z.infer<typeof AnyNodeZod> | undefined {
  switch (el.type) {
    case "PluginCell":
      if (el.plugin_id === containerId) {
        return el;
      }
      return undefined;
    case "VerticalLayout":
      if (el.identifier === containerId) {
        return el;
      }

      return el.children
        .map((e) => {
          return traverseNode(e, containerId);
        })
        .find(Boolean);
  }
}

function removeOldItemInChildren(
  el: z.infer<typeof AnyNodeZod>,
  containerId: string
) {
  if (el.type === "PluginCell") {
    // plugin cells cant have children. Nothing we can do here. This needs to be done in the parent
    return;
  }
  el.children = el.children.filter((e) => {
    switch (e.type) {
      case "PluginCell":
        return e.plugin_id !== containerId || e.newElement;
      case "VerticalLayout":
        removeOldItemInChildren(e, containerId);
        return e.identifier !== containerId || e.newElement;
    }
  });
}

// This function traverses all known plugins and returns the ones that are not found within the layout
function makePluginIdsInParkingLot(
  pluginIds: Record<
    string,
    z.infer<typeof PluginStateContainingCurrentStateZod>
  >,
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
    returnIdsForLayout(layout.root).map((e) => [e, true])
  );
  const idsNotInLayout = Object.keys(pluginIds).filter(
    (e) => !knownIds[e] && pluginIds[e]!.current_state.type !== "Disabled"
  );
  console.log({ knownIds, idsNotInLayout });

  return idsNotInLayout;
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
  const [currentDraggingItem, setCurrentDraggingItem] = useState<Active>();

  const pluginsInParkingLot = makePluginIdsInParkingLot(
    pluginState ?? {},
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
      <DndContext
        onDragStart={(ev) => {
          setCurrentDraggingItem(ev.active);
        }}
        onDragEnd={(ev) => {
          setCurrentDraggingItem(undefined);
          if (!ev.over) {
            return;
          }
          // if here, the element was moved. We try to find the Container to insert the element into
          const movedItemData = AnyNodeZod.parse(ev.active.data.current);

          // Iterate over the entire layount looking for the parent container
          if (!layout) {
            console.warn("Layout not defined. Ignoring move");
            return;
          }
          const clonedLayout = structuredClone(layout);
          // We only insert if we didnt move this over our magic parking lot container
          if (ev.over.id !== "\t@parkinglot") {
            const targetData = z
              .object({
                containerId: z.string(),
                afterId: z.string().optional(),
              })
              .parse(ev.over.data.current);
            const parentContainer = traverseNode(
              clonedLayout.root,
              targetData.containerId
            );
            if (!parentContainer) {
              console.warn(
                "Tried looking for parent container, but couldnt find it"
              );
              return;
            }
            if (parentContainer.type !== "VerticalLayout") {
              console.warn("found container is not a layout. shouldnt happen");
              return;
            }
            let indexInContainer = -1;
            if (targetData.afterId) {
              indexInContainer = parentContainer.children.findIndex((e) => {
                switch (e.type) {
                  case "PluginCell":
                    return e.plugin_id === targetData.afterId;
                  case "VerticalLayout":
                    return e.identifier === targetData.afterId;
                }
              });
            }
            movedItemData.newElement = true;

            // -1 means "insert at the start". We add 1 so we actually reference the index
            indexInContainer++;
            if (indexInContainer > parentContainer.children.length) {
              parentContainer.children.push(movedItemData);
            } else {
              parentContainer.children.splice(
                indexInContainer,
                0,
                movedItemData
              );
            }
            // we then iterate over the entire tree again, but remove any item that does not have the newElement=true set
          }

          removeOldItemInChildren(
            clonedLayout.root,
            movedItemData.type === "PluginCell"
              ? movedItemData.plugin_id
              : movedItemData.identifier
          );

          invoke("sync_main_layout", { layout: clonedLayout }).then((e) => {
            const { data } = z
              .object({ data: PluginViewStructureZod })
              .parse(e);
            setLayout(data);
          });
        }}
      >
        <PluginStateCtx.Provider value={pluginState}>
          {layout ? (
            <VerticalLayout layout={layout.root} editMode={isEditMode} />
          ) : (
            <p>Loading…</p>
          )}
          {isEditMode && (
            <div
              className={` fixed ${
                isParkingLotExpanded ? "bottom-0" : "-bottom-40"
              } w-full h-48 duration-200`}
            >
              <div className="flex flex-col h-full">
                <div className=" flex flex-row items-center gap-2">
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
                  <span
                    className={` text-xs italic pointer-events-none ${
                      isParkingLotExpanded ? "opacity-20" : "opacity-0"
                    } duration-300`}
                  >
                    Parked plugins are still executed
                  </span>
                </div>
                <section id="parking-lot-inner" className="relative h-full">
                  <div className="flex flex-row max-w-full overflow-x-scroll h-full flex-1 bg-green-950">
                    {pluginsInParkingLot ? (
                      pluginsInParkingLot.length > 0 ? (
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
                        <div className=" opacity-40 w-full flex justify-center flex-col">
                          <p className=" text-2xl font-black text-center">
                            Empty!
                          </p>
                          <span className=" mx-2  ">
                            All your active plugins are on the main layout.
                            Feeling crammed? Drag your plugins into here to move
                            them into the parking lot
                          </span>
                        </div>
                      )
                    ) : (
                      <span>Loading…</span>
                    )}
                  </div>
                  {currentDraggingItem && <ParkingLotDropTarget />}
                </section>
              </div>
            </div>
          )}
        </PluginStateCtx.Provider>
        <DragOverlay
          style={
            currentDraggingItem
              ? {
                  width: currentDraggingItem.rect.current.initial?.width,
                  height: currentDraggingItem.rect.current.initial?.height,
                }
              : undefined
          }
        >
          {currentDraggingItem ? (
            <div className="p-2 border-2 relative rounded-lg  border-gray-400 bg-white/20 cursor-grabbing">
              <span>{currentDraggingItem.id}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}

export default App;
