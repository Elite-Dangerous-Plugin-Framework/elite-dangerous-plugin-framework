import z from "zod";

export const PluginCurrentStateDisabledZod = z.object({
  type: z.literal("Disabled"),
});
export type PluginCurrentStateDisabled = z.infer<
  typeof PluginCurrentStateDisabledZod
>;
export const PluginCurrentStateStartingZod = z.object({
  type: z.literal("Starting"),
  metadata: z.array(z.string()),
});
export type PluginCurrentStateStarting = z.infer<
  typeof PluginCurrentStateStartingZod
>;
export const PluginCurrentStateFailedToStartZod = z.object({
  type: z.literal("FailedToStart"),
  reasons: z.array(z.string()),
});
export type PluginCurrentStateFailedToStart = z.infer<
  typeof PluginCurrentStateFailedToStartZod
>;
export const PluginCurrentStateDisablingZod = z.object({
  type: z.literal("Disabling"),
});
export type PluginCurrentStateDisabling = z.infer<
  typeof PluginCurrentStateDisablingZod
>;

export const PluginCurrentStateRunningZod = z.object({
  type: z.literal("Running"),
});
export type PluginCurrentStateRunning = z.infer<
  typeof PluginCurrentStateRunningZod
>;

export const PluginCurrentStateZod = z.union([
  PluginCurrentStateStartingZod,
  PluginCurrentStateDisabledZod,
  PluginCurrentStateFailedToStartZod,
  PluginCurrentStateDisablingZod,
  PluginCurrentStateRunningZod,
]);

export type PluginCurrentState = z.infer<typeof PluginCurrentStateZod>;
export type PluginCurrentStateKeys = PluginCurrentState["type"];
