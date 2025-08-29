import { PluginStatesSimple } from "./Settings";

export function getBorderColourForstate(st: PluginStatesSimple) {
  const colourMapping: Record<PluginStatesSimple, string> = {
    Disabled: "border-gray-500",
    Starting: "border-lime-300",
    FailedToStart: "border-red-500",
    Running: "border-green-400",
    Disabling: "border-amber-400",
  };
  return colourMapping[st];
}
