import { useEffect, useRef, useState } from "react";
import {
  CloseIcon,
  EditPlugins,
  FullScreenIcon,
  MinimizeIcon,
  SettingsIcon,
} from "../icons/navbar";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { PluginState, PluginStateZod } from "../types/PluginState";
import { getAllPluginStates } from "../commands/getAllPluginStates";
import z from "zod";
import { PluginContext } from "./PluginContext";
import { listen } from "@tauri-apps/api/event";

const LoadedPluginStateLookup = z.record(
  z.string(),
  z.union([
    z.object({
      type: z.literal("Running"),
      ref: z.instanceof(HTMLElement).optional(),
      customElementName: z.string(),
      capabilities: z.object({}),
      context: z.instanceof(PluginContext),
    }),
  ])
);

function App() {
  const loadedPluginsLookup = useRef<z.infer<typeof LoadedPluginStateLookup>>(
    {}
  );

  const rootTokenRef = useRef<string>();
  const updatePluginIdsBufferRef = useRef<Record<string, null>>({});
  const updatePluginIdsDebouncerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const [appWin, setAppWin] = useState<Window>();
  const [isMaximized, setIsMaximized] = useState(false);

  /// Contains the current plugin state and the plugin that was just updated. If undefined, we assume initial startup
  const [[pluginStates, updateIDs], setPluginStates] = useState<
    [Record<string, PluginState>, string[] | undefined]
  >([{}, undefined]);

  useEffect(() => {
    const win = getCurrentWindow();
    setAppWin(win);
    win.isMaximized().then((e) => setIsMaximized(e));
    getAllPluginStates().then((e) => setPluginStates([e, undefined]));

    const unlisten = listen("core/plugins/update", (ev) => {
      console.log(ev.payload)
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
        setPluginStates([state, Object.keys(updatePluginIdsBufferRef.current)]);
        updatePluginIdsBufferRef.current = {}
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
        (async () => {
          const result = z
            .object({
              success: z.literal(false),
              reason: z.enum(["PLUGIN_NOT_FOUND"]),
            })
            .or(
              z.object({
                success: z.literal(true),
                import: z.string(),
                hash: z.string(),
              })
            )
            .parse(
              await invoke("get_import_path_for_plugin", { pluginId: pluginID })
            );
          if (!result.success) {
            await invoke("start_plugin_failed", {
              pluginId: pluginID,
              reasons: [result.reason],
            });
            return;
          }
          // now try to import the module
          let module: any;
          try {
            module = await import(/* @vite-ignore */ result.import);
          } catch (err) {
            console.error(err);
            await invoke("start_plugin_failed", {
              pluginId: pluginID,
              reasons: ["MODULE_IMPORT_FAILED"],
            });
            return;
          }
          // if here, module exists
          if (!module.default) {
            // but doesnt have a default export
            await invoke("start_plugin_failed", {
              pluginId: pluginID,
              reasons: ["NO_DEFAULT_EXPORT"],
            });
            return;
          }
          // This essentially checks if the export is a class definition that inherits HTMLElement
          if (
            typeof module.default !== "function" ||
            !Object.prototype.isPrototypeOf.call(
              HTMLElement.prototype,
              module.default.prototype
            )
          ) {
            await invoke("start_plugin_failed", {
              pluginId: pluginID,
              reasons: ["DEFAULT_EXPORT_NOT_HTMLELEMENT"],
            });
            return;
          }
          let customElementID = `main-${pluginID}-${result.success ? result.hash : "no-hash"
            }`;
          if (!customElements.get(customElementID)) {
            customElements.define(customElementID, module.default);
          } else {
            console.info("custom element was already defined");
          }
          console.info(
            customElementID,
            "registered:",
            customElements.get(customElementID)
          );
          // We spawn the HTML Element
          let item: HTMLElement;
          try {
            item = new module.default();
          } catch (e) {
            await invoke("start_plugin_failed", {
              pluginId: pluginID,
              reasons: ["INSTANTIATION_FAILED"],
            });
            return;
          }
          if (!(item instanceof HTMLElement)) {
            await invoke("start_plugin_failed", {
              pluginId: pluginID,
              reasons: ["PLUGIN_INSTANCE_NOT_HTMLELEMENT"],
            });
            return;
          }
          if (
            !("initPlugin" in item) ||
            typeof item.initPlugin !== "function"
          ) {
            console.log(item)
            await invoke("start_plugin_failed", {
              pluginId: pluginID,
              reasons: ["PLUGIN_MISSING_INIT_FUNCTION"],
            });
            return;
          }
          try {
            item.initPlugin("TODO");
          } catch {
            await invoke("start_plugin_failed", {
              pluginId: pluginID,
              reasons: ["PLUGIN_MISSING_INIT_FUNCTION_ERRORED"],
            });
            return;
          }
          document.getElementById("plugins")!.appendChild(item);
          const { data }: { data: string } = await invoke("get_instance_id_by_plugin", { pluginId: pluginID, rootToken: rootTokenRef.current })
          loadedPluginsLookup.current[pluginID] = {
            type: "Running",
            customElementName: customElementID,
            capabilities: {},
            context: new PluginContext(data),
            ref: item,
          };
          await invoke("finalize_start_plugin", {
            pluginId: pluginID
          })
        })();
      }
      if ("Disabling" in pluginState.current_state) {
        (async () => {
          // Do reconciliation for Disabling
          if (loadedPluginsLookup.current[pluginID]) {
            const data = loadedPluginsLookup.current[pluginID]
            if (data.type === "Running" && !!data.ref) {
              data.ref.remove()
              data.ref = undefined
            }
          }
          await invoke("finalize_stop_plugin", { pluginId: pluginID });
          return;
        })();
      }
    }
  }, [pluginStates, updateIDs]);

  return (
    <main className="bg-slate-950 min-h-[100vh] text-white flex flex-col group">
      <header
        data-tauri-drag-region
        className="flex justify-end gap-1 items-end group-hover:visible invisible cursor-move "
      >
        <button
          title="Open Settings"
          onClick={() => {
            invoke("open_settings");
          }}
          className="px-2 cursor-pointer hover:bg-white/10"
        >
          <SettingsIcon className="w-6 h-6" />
        </button>
        <button
          title="Change Plugin Arrangement"
          className="px-2 cursor-pointer hover:bg-white/10"
        >
          <EditPlugins className="w-6 h-6" editing={false} />
        </button>
        <div className="flex-1" />
        <button
          title="Minimize"
          className="px-2 cursor-pointer hover:bg-blue-900"
        >
          <MinimizeIcon
            className="w-6 h-6"
            onClick={() => {
              if (!appWin) {
                return;
              }
              appWin.minimize();
            }}
          />
        </button>
        <button
          title="Maximize"
          className="px-2 cursor-pointer hover:bg-blue-900"
        >
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
      <section id="plugins"></section>
    </main>
  );
}

export default App;
