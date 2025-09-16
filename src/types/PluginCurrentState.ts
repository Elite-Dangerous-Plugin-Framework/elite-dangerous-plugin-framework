import z from "zod";

export const PluginCurrentStateDisabledZod = z.object({
  Disabled: z.object({}),
});
export type PluginCurrentStateDisabled = z.infer<
  typeof PluginCurrentStateDisabledZod
>;
export const PluginCurrentStateStartingZod = z.object({
  Starting: z.object({
    metadata: z.array(z.string()),
  }),
});
export type PluginCurrentStateStarting = z.infer<
  typeof PluginCurrentStateStartingZod
>;
export const PluginCurrentStateFailedToStartZod = z.object({
  FailedToStart: z.object({
    reasons: z.array(z.string()),
  }),
});
export type PluginCurrentStateFailedToStart = z.infer<
  typeof PluginCurrentStateFailedToStartZod
>;
export const PluginCurrentStateDisablingZod = z.object({
  Disabling: z.object({}),
});
export type PluginCurrentStateDisabling = z.infer<
  typeof PluginCurrentStateDisablingZod
>;

export const PluginCurrentStateRunningZod = z.object({
  Running: z.object({
  }),
});
export type PluginCurrentStateRunning = z.infer<
  typeof PluginCurrentStateRunningZod
>;

export const PluginCurrentStateZod = z.union([
  PluginCurrentStateStartingZod,
  PluginCurrentStateDisabledZod, PluginCurrentStateFailedToStartZod, PluginCurrentStateDisablingZod, PluginCurrentStateRunningZod
]);

export type PluginCurrentState = z.infer<typeof PluginCurrentStateZod>;

export type PluginCurrentStateKeys = keyof PluginCurrentStateDisabled | keyof PluginCurrentStateStarting | keyof PluginCurrentStateFailedToStart | keyof PluginCurrentStateDisabling | keyof PluginCurrentStateRunning
