import { PluginCurrentStateKeys } from "../types/PluginCurrentState";
import { PluginStateUIData } from "./utils";

export function SettingsMainNoneSelected({
  pluginStateCount,
}: {
  pluginStateCount: Record<PluginCurrentStateKeys, number>;
}) {
  return (
    <div className="p-2 overflow-y-scroll">
      <p>Select a plugin on the left to configure it.</p>
      <SettingsStateVisualizer pluginStateCount={pluginStateCount} />
      <h2 className="my-2 text-lg">Core Settings</h2>
      <p className="text-sm text-gray-400">
        Nothing is configurable in the MVP. This will come later
      </p>
    </div>
  );
}

function SettingsStateVisualizer({
  pluginStateCount,
}: {
  pluginStateCount: Record<PluginCurrentStateKeys, number>;
}) {
  return (
    <div className="flex flex-row mt-2">
      {(
        [
          "Disabled",
          "Starting",
          "FailedToStart",
          "Running",
          "Disabling",
        ] as PluginCurrentStateKeys[]
      )
        .filter((e) => pluginStateCount[e] > 0)
        .map((e) => (
          <div
            style={{
              borderColor: PluginStateUIData[e].colour,
              color: PluginStateUIData[e].colour,
            }}
            className={
              "p-1 text-xs inline-flex flex-row gap-1 justify-baseline border-1 rounded-lg "
            }
            key={e}
          >
            <span>{e}:</span>
            <span className="px-1">{pluginStateCount[e]}</span>
          </div>
        ))}
    </div>
  );
}
