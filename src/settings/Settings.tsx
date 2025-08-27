import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { PluginManifestV1Alpha } from "../types/generated/pluiginManifes";
import { PluginState } from "../types/generated/pluginState";
import z from "zod";

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
    <main className="min-h-[100vh] bg-slate-900 flex flex-row text-white">
      <section
        id="plugin_select"
        className="w-[200px] bg-neutral-800 overflow-y-scroll"
      >
        <h1 className="p-2">Your Plugins</h1>
        {(pluginStates ?? []).length === 0 ? (
          <p>No plugins loaded</p>
        ) : (
          pluginStates!.map((e) => (
            <SettingsSidebarPlugin
              onPluginSelected={(id) => {
                console.log(id);
              }}
              key={e.id}
              plugin={e}
              selected
            />
          ))
        )}
      </section>
      <section id="settings"></section>
    </main>
  );
}

function SettingsSidebarPlugin({
  plugin,
  selected,
}: {
  plugin: PluginState & { id: string };
  onPluginSelected: (id: string) => void;
  selected: boolean;
}) {
  let name = plugin.id;
  let description: string | undefined = undefined;
  if (plugin.manifest.type === "v1alpha") {
    const manifest = plugin.manifest as any as PluginManifestV1Alpha;
    name = manifest.name;
    if (typeof manifest.description === "string") {
      description = manifest.description;
    }
  }

  // Reduce the stateful enums down to stateless enums
  const currentState = inferCurrentState(plugin.current_state);

  const colourMapping: Record<typeof currentState, string> = {
    Disabled: "border-gray-500",
    Starting: "border-lime-300",
    FailedToStart: "border-red-500",
    Running: "border-green-400",
    Disabling: "border-amber-400",
  };

  return (
    <button
      className={`inline-flex border-l-8 flex-row w-full p-2 text-xs cursor-pointer hover:bg-white/10 ${
        colourMapping[currentState]
      } ${selected ? "bg-white/40" : ""}`}
    >
      <p className=" inline-flex justify-baseline items-center gap-1">{name}</p>
    </button>
  );
}

function inferCurrentState(current: PluginState["current_state"]) {
  if (current == "Disabled") {
    return "Disabled" as const;
  }
  if ((current as any).Starting) {
    return "Starting" as const;
  }
  if ((current as any).FailedToStart) {
    return "FailedToStart" as const;
  }
  if ((current as any).Running) {
    return "Running" as const;
  }
  if ((current as any).Disabling) {
    return "Disabling" as const;
  }
  throw new Error("state could not be mapped");
}
