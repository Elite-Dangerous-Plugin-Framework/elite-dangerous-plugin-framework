import { useEffect, useState } from "react";

import { SettingsMainNoneSelected } from "./SettingsCore";
import { PluginState } from "../types/PluginState";
import { SettingsPluginPane } from "./SettingsPluginPane";
import { listen } from "@tauri-apps/api/event";
import { getAllPluginStates } from "../commands/getAllPluginStates";
import { PluginCurrentStateKeys } from "../types/PluginCurrentState";
import {
  countPluginStates,
  PluginStateUIData,
} from "./utils";
import { ZondiconsFolder } from "../icons/pluginType";
import { invoke } from "@tauri-apps/api/core";

export default function Settings() {
  const [pluginStates, setPluginStates] =
    useState<(PluginState & { id: string })[]>();
  const [activeId, setActiveId] = useState<string>();

  useEffect(() => {
    const updateUnlisten = listen("core/plugins/update", (ev) => {
      (async () => {
        const result = Object.entries(await getAllPluginStates())
          .map(([id, v]) => ({ ...v, id }))
          .sort((a, b) => a.id.localeCompare(b.id));
        setPluginStates(result);
      })();
    });

    return () => {
      updateUnlisten.then((e) => e());
    };
  }, []);

  useEffect(() => {
    (async () => {
      const result = Object.entries(await getAllPluginStates())
        .map(([id, v]) => ({ ...v, id }))
        .sort((a, b) => a.id.localeCompare(b.id));
      setPluginStates(result);
    })();

    return () => {
      // Cleanup
    };
  }, []);

  return (
    <main className="min-h-[100vh] bg-neutral-900 flex flex-row text-white select-none">
      <section id="plugin_select" className="w-[200px] bg-neutral-800 fixed">
        <div className="flex flex-col h-[100vh] overflow-y-scroll ">
          <h1
            className="p-2 cursor-pointer hover:bg-white/10"
            onClick={() => setActiveId(undefined)}
          >
            Your Plugins
          </h1>
          {(pluginStates ?? []).length === 0 ? (
            <p>No plugins loaded</p>
          ) : (
            pluginStates!.map((e) => (
              <SettingsSidebarPlugin
                onPluginSelected={(id) => {
                  setActiveId(id);
                }}
                key={e.id}
                plugin={e}
                selected={activeId == e.id}
              />
            ))
          )}
          <div className="flex-1" />
          <hr className=" mx-2 text-gray-600" />
          <button
            onClick={() => {
              invoke("open_plugins_dir", {});
            }}
            className="flex cursor-pointer flex-row justify-center items-center gap-2 py-2 hover:bg-white/10"
          >
            <ZondiconsFolder />
            <span>Open Plugin Folder</span>
          </button>
        </div>
      </section>
      <section id="settings" className="flex-1 pl-[200px] inline-flex flex-col">
        {activeId === undefined ? (
          <SettingsMainNoneSelected
            pluginStateCount={countPluginStates(pluginStates ?? [])}
          />
        ) : (
          <SettingsMain
            plugin={(pluginStates ?? []).find((e) => e.id === activeId)}
          />
        )}
      </section>
    </main>
  );
}

function SettingsMain({
  plugin,
}: {
  plugin: (PluginState & { id: string }) | undefined;
}) {
  if (!plugin) {
    return (
      <div>
        <span className=" text-lg">Whoops…</span> The plugin you're trying to
        access couldn't be found by ID. This is probably a bug.
      </div>
    );
  }

  return <SettingsPluginPane plugin={plugin} />;
}

function SettingsSidebarPlugin({
  plugin,
  selected,
  onPluginSelected,
}: {
  plugin: PluginState & { id: string };
  onPluginSelected: (id: string) => void;
  selected: boolean;
}) {
  let name = plugin.id;
  if (plugin.manifest.type === "v1alpha") {
    name = plugin.manifest.name;
  }

  // Reduce the stateful enums down to stateless enums
  const currentStateType = plugin.current_state.type

  return (
    <button
      onClick={() => onPluginSelected(plugin.id)}
      style={{
        backgroundColor: selected
          ? PluginStateUIData[currentStateType].colour + "40"
          : "unset",
      }}
      className={`inline-flex items-center gap-1 flex-row w-full p-2 text-xs cursor-pointer hover:bg-white/10 ${selected ? " underline" : ""
        }`}
    >
      <StatusIndicator state={currentStateType} />
      <p className=" inline-flex justify-baseline items-center gap-1">{name}</p>
    </button>
  );
}

export function StatusIndicator({ state }: { state: PluginCurrentStateKeys }) {
  return (
    <span title={state} className="relative flex size-3">
      {PluginStateUIData[state].pulsating && (
        <span
          style={{ backgroundColor: PluginStateUIData[state].colour }}
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
        ></span>
      )}{" "}
      <span
        style={{ backgroundColor: PluginStateUIData[state].colour }}
        className="relative inline-flex size-3 rounded-full "
      ></span>
    </span>
  );
}
