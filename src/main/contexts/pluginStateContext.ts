import { createContext } from "react";
import { PluginStateContainingCurrentStateZod } from "../PluginsManager";
import z from "zod";

export const PluginStateCtx = createContext<
  | undefined
  | Record<string, z.infer<typeof PluginStateContainingCurrentStateZod>>
>(undefined);
