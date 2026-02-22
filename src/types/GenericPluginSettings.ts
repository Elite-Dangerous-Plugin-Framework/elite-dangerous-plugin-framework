import z from "zod";

export const GenericPluginSettingsZod = z.object({
  enabled: z.boolean(),
  already_known: z.boolean(),
  update_strategy: z.enum(["Autoupdate", "NagOnStartup", "Manual"]),
  consider_prereleases: z.boolean()
})

export type GenericPluginSettings = z.infer<typeof GenericPluginSettingsZod>