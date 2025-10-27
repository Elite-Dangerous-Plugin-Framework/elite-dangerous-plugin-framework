import z from "zod";
import { VerticalNodeZod } from "./types";
import PluginCell from "./PluginCell";

export interface VerticalLayoutProps {
  layout: z.infer<typeof VerticalNodeZod>;
  editMode: boolean;
}

export default function VerticalLayout({
  layout,
  editMode,
}: VerticalLayoutProps) {
  return (
    <div
      className={`flex flex-col gap-1 ${
        editMode ? " border border-amber-700 rounded-lg" : ""
      }`}
    >
      {layout.children.map((e) => {
        if (e.type === "PluginCell") {
          return (
            <PluginCell key={e.plugin_id} layout={e} editMode={editMode} />
          );
        }
      })}
    </div>
  );
}
