import z from "zod";
import { PluginCurrentStateZod } from "./PluginCurrentState";

export const FrontendPluginStateZod = z.object({
  state: PluginCurrentStateZod,
  // tracked here means that its currently running with this hash. If the Backend has a different hash, we know that we should do a restart
  tracked_frontend_hash: z.string()
})

export type FrontendPluginState = z.infer<typeof FrontendPluginStateZod>