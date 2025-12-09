import z from "zod";

export const V1AlphaManifestZod = z.object({
  type: z.literal("v1alpha"),
  name: z.string().nonempty(),
  description: z.string().optional().nullable(),
  repository_url: z.string().optional().nullable(),
  support_url: z.string().optional().nullable(),
  version: z.string().optional().nullable(),
});

export type V1AlphaManifest = z.infer<typeof V1AlphaManifestZod>;

export const ManifestZod = z.union([
  V1AlphaManifestZod
]);
export type Manifest = z.infer<typeof ManifestZod>;
