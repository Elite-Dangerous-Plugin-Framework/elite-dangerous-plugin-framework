import z from "zod";

export const PluginViewStructureZodMeta = z.object({
  min_height: z.string().nullable().optional(),
  max_height: z.string().nullable().optional(),
  min_width: z.string().nullable().optional(),
  max_width: z.string().nullable().optional(),
});
export const PluginCellNodeZod = z.object({
  type: z.literal("PluginCell"),
  plugin_id: z.string(),
  meta: PluginViewStructureZodMeta,
  newElement: z.boolean().optional(),
});

export const VerticalNodeZod = z.object({
  type: z.literal("VerticalLayout"),
  meta: PluginViewStructureZodMeta,
  identifier: z.string(),
  newElement: z.boolean().optional(),
  get children() {
    return z.array(AnyNodeZod);
  },
});

export const AnyNodeZod = z.union([VerticalNodeZod, PluginCellNodeZod]);

export const PluginViewStructureZod = z.object({
  root: VerticalNodeZod,
});
