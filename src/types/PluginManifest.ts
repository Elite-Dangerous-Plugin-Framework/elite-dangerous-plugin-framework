import z from "zod";

export const V1AlphaManifestZod = z.object({
  type: z.literal("v1alpha"),
  name: z.string().nonempty(),
  description: z.string().optional(),
  repository_url: z.string().optional(),
  support_url: z.string().optional(),
  version: z.string().optional(),
});

export type V1AlphaManifest = z.infer<typeof V1AlphaManifestZod>;

export const ManifestZod = V1AlphaManifestZod; // .or(…) later
