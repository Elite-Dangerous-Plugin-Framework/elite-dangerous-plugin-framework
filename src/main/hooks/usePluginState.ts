import { useContext } from "react";
import { PluginStateCtx } from "../contexts/pluginStateContext";

// Returns the plugin state
export function usePluginState(pluginID: string) {
  const ctx = useContext(PluginStateCtx);
  if (!ctx) {
    return undefined;
  }
  return ctx[pluginID];
}
