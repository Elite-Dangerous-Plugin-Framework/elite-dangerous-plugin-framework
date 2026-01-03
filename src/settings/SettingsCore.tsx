import { useTranslation } from "react-i18next";
import { PluginCurrentStateKeys } from "../types/PluginCurrentState";
import { PluginStateUIData } from "./utils";
import { IconCannotUpdate, IconDownload, IconUpToDate } from "../icons/updates";
import { SettingsEdpfUpdates } from "./SettingsEdpfUpdates";
import { CommandWrapper } from "../commands/commandWrapper";

interface SettingsMainNoneSelectedProps {
  pluginStateCount: Record<PluginCurrentStateKeys, number>;
  cmd: CommandWrapper;
}

export function SettingsMainNoneSelected({
  pluginStateCount,
  cmd,
}: SettingsMainNoneSelectedProps) {
  const { t } = useTranslation("settings");

  return (
    <div className="p-2 overflow-y-scroll">
      <p>{t("selectPluginLeft")}</p>
      <SettingsStateVisualizer pluginStateCount={pluginStateCount} />
      <section id="updates">
        <h2 className="mt-2 text-lg">{t("update.heading")}</h2>
        <SettingsEdpfUpdates cmd={cmd} />
      </section>
    </div>
  );
}

function SettingsStateVisualizer({
  pluginStateCount,
}: {
  pluginStateCount: Record<PluginCurrentStateKeys, number>;
}) {
  const { t } = useTranslation("settings");

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
            className={`p-1 text-xs inline-flex flex-row gap-1 justify-baseline border-1 rounded-lg ${
              PluginStateUIData[e].pulsating ? "animate-pulse" : ""
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
