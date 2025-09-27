import { PluginCurrentStateKeys } from "../types/PluginCurrentState";
import { PluginState } from "../types/PluginState";

export function countPluginStates(
  plugins: PluginState[]
): Record<PluginCurrentStateKeys, number> {
  const response = {
    Disabled: 0,
    Starting: 0,
    FailedToStart: 0,
    Running: 0,
    Disabling: 0,
  };

  for (const plugin of plugins) {
    response[plugin.current_state.type]++;
  }
  return response;
}


export const PluginStateUIData: Record<
  PluginCurrentStateKeys | "Missing",
  { colour: string; pulsating: boolean }
> = {
  Starting: {
    colour: "#DBBE57",
    pulsating: true,
  },
  Disabled: {
    colour: "#697296",
    pulsating: false,
  },
  FailedToStart: {
    colour: "#DC2323",
    pulsating: false,
  },
  Disabling: {
    colour: "#595256",
    pulsating: true,
  },
  Running: {
    colour: "#39C655",
    pulsating: false,
  },
  Missing: {
    colour: "#5B5B5B",
    pulsating: false,
  },
};
