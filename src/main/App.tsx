import { useEffect, useRef, useState } from "react";
import z from "zod";
import { Header } from "./Header";
import PluginsManager, {
  PluginStateContainingCurrentStateZod,
} from "./PluginsManager";
import { AnyNodeZod, PluginViewStructureZod } from "./layouts/types";
import VerticalLayout from "./layouts/VerticalLayout";
import { PluginStateCtx } from "./contexts/pluginStateContext";
import { Active, DndContext, DragOverlay } from "@dnd-kit/core";
import Parkinglot from "./Parkinglot";
import { getRootToken } from "../commands/getRootToken";
import PluginReconcilerImpl from "./PluginReconciler";
import {
  makePluginIdsInParkingLot,
  removeOldItemInChildren,
  traverseNode,
} from "./helpers";
import { CommandWrapper } from "../commands/commandWrapper";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";

export default function App() {
  const { i18n } = useTranslation("settings")

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

  useEffect(() => {
    const updateUnlistens: Promise<UnlistenFn>[] = []

    let manager: PluginsManager | undefined;
    if (!pluginManagerRef.current || pluginManagerRef.current.destroyed) {
      getRootToken().then((rootToken) => {
        const command = new CommandWrapper(rootToken);
        command.syncMainLayout().then((e) => {
          if (e.success) {
            setLayout(e.data);
          }
        });

        command.syncMainLayout().then((e) => {
          if (!e.success) {
            throw new Error("failed to sync layout: " + e.reason);
          }
          console.log("sync layout resp", e.data);

          setLayout(e.data);
        });

        command.readSetting("core", "core.Locale").then(e => {
          if (!e.success) {
            return
          }
          const locale = e.data.value ?? "en"
          i18n.changeLanguage(locale)
        })

        updateUnlistens.push(listen("settings_update", async ({ payload }) => {
          if (!command) return
          const decrypted = await command.decryptSettingsPayload(payload)
          if (!decrypted || !decrypted.success) {
            console.error("failed to RX settings update", { reason: decrypted.reason })
            return
          }
          // For now, we just care about the locale. This might change in the future (e.g. theming)
          if (decrypted.data.key === "core.Locale") {
            const locale = decrypted.data.value ?? "en"
            i18n.changeLanguage(locale)
          }
        }))

        const reconciler = new PluginReconcilerImpl(command);
        manager = new PluginsManager(command, reconciler);
        manager.init(setPluginState);
        pluginManagerRef.current = manager;

        return () => {
          Promise.all(updateUnlistens).then(e => e.forEach(e => e()))
        }
      });
    } else {
      console.info("plugin manager ref already exists — not recreating");
    }
    return () => {
      if (manager) {
        console.info("plugin manager ref destroying");
        manager.destroy();
      } else {
        console.info("plugin manager doesnt exist");
      }
    };
  }, []);

  return (
    <main
      id="main-window"
      className="bg-slate-950 min-h-[100vh] text-white flex flex-col group"
    >
      {/* 
        isMaximized is hard-coded due to an issue trying to commit the Maximized State.
        See https://github.com/tauri-apps/plugins-workspace/issues/2088
      */}
      <Header
        isMaximized={false}
        isEditMode={isEditMode}
        toggleEditMode={() => setIsEditMode(!isEditMode)}
        handleOpenSettingsClick={() =>
          pluginManagerRef.current && pluginManagerRef.current.openSettings()
        }
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

          pluginManagerRef.current &&
            pluginManagerRef.current.syncLayout(clonedLayout).then((e) => {
              if (!e.success) {
                throw new Error("failed to sync layout: " + e.reason);
              }
              console.log("sync layout resp", e.data);

              setLayout(e.data);
            });
        }}
      >
        <PluginStateCtx.Provider value={pluginState}>
          {layout ? (
            <VerticalLayout
              className=" overflow-y-scroll h-full flex-1"
              layout={layout.root}
              editMode={isEditMode}
            />
          ) : (
            <p>Loading…</p>
          )}
          {isEditMode && pluginsInParkingLot && (
            <Parkinglot
              isParkingLotExpanded={isParkingLotExpanded}
              setIsParkingLotExpanded={setIsParkingLotExpanded}
              pluginsInParkingLot={pluginsInParkingLot}
              isEditMode={isEditMode}
              currentDraggingItem={currentDraggingItem}
            />
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
