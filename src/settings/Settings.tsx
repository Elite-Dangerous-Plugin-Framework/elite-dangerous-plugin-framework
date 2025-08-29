import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import { SettingsMainNoneSelected } from "./SettingsCore";
import { getBorderColourForstate } from "./utils";
import { PluginState } from "../types/PluginState";
import { SettingsPluginPane } from "./SettingsPluginPane";

async function getAllPluginStates() {
  return (await invoke("fetch_all_plugins")) as Record<string, PluginState>;
}

export default function Settings() {
  const [pluginStates, setPluginStates] =
    useState<(PluginState & { id: string })[]>();
  const [activeId, setActiveId] = useState<string>();

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
      <section
        id="plugin_select"
        className="w-[200px] bg-neutral-800 fixed min-h-[100vh]"
      >
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
  const currentState = inferCurrentState(plugin.current_state);

  return (
    <button
      onClick={() => onPluginSelected(plugin.id)}
      className={`inline-flex border-l-8 flex-row w-full p-2 text-xs cursor-pointer hover:bg-white/10 ${getBorderColourForstate(
        currentState
      )} ${selected ? "bg-white/40" : ""}`}
    >
      <p className=" inline-flex justify-baseline items-center gap-1">{name}</p>
    </button>
  );
}

export type PluginStatesSimple =
  | "Disabled"
  | "Starting"
  | "FailedToStart"
  | "Running"
  | "Disabling";

function countPluginStates(
  plugins: PluginState[]
): Record<PluginStatesSimple, number> {
  const response = {
    Disabled: 0,
    Starting: 0,
    FailedToStart: 0,
    Running: 0,
    Disabling: 0,
  };

  for (const plugin of plugins) {
    response[inferCurrentState(plugin.current_state)]++;
  }
  return response;
}

function inferCurrentState(
  current: PluginState["current_state"]
): PluginStatesSimple {
  for (const item of [
    "Disabled",
    "Starting",
    "FailedToStart",
    "Running",
    "Disabling",
  ] as const) {
    if (item in current) {
      return item;
    }
  }
  throw new Error("state could not be mapped");
}
