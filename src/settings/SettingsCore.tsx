import { useTranslation } from "react-i18next";
import { PluginCurrentStateKeys } from "../types/PluginCurrentState";
import { PluginStateUIData } from "./utils";

export function SettingsMainNoneSelected({
  pluginStateCount,
}: {
  pluginStateCount: Record<PluginCurrentStateKeys, number>;
}) {

  const { t } = useTranslation("settings")

  return (
    <div className="p-2 overflow-y-scroll">
      <p>{t("selectPluginLeft")}</p>
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

  const { t } = useTranslation("settings")

  return (
    <div className="flex flex-row mt-2 gap-1">
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
            className={`p-1 text-xs inline-flex flex-row gap-1 justify-baseline border-1 rounded-lg ${PluginStateUIData[e].pulsating ? "animate-pulse" : ""
              } `}
            key={e}
          >
            <span>{t(("pluginStates." + e) as any)}:</span>
            <span className="px-1">{pluginStateCount[e]}</span>
          </div>
        ))}
    </div>
  );
}
