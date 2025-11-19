import z from "zod";
import { VerticalNodeZod } from "./types";
import PluginCell from "./PluginCell";
import { useDndContext } from "@dnd-kit/core";
import React from "react";
import DropTarget from "./DropTarget";

export interface VerticalLayoutProps {
  layout: z.infer<typeof VerticalNodeZod>;
  editMode: boolean;
  className?: string;
}

export default function VerticalLayout({
  layout,
  editMode,
  className = "",
}: VerticalLayoutProps) {
  const { active } = useDndContext();

  return (
    <fieldset
      role="presentation"
      className={`flex flex-col w-full items-stretch gap-1 ${
        editMode ? " border border-amber-700 rounded-lg px-1" : ""
      } ${className}`}
    >
      {editMode && (
        <legend className="text-xs text-amber-700 ml-1 italic w-fit">
          Vertical Layout
        </legend>
      )}
      {layout.children.length === 0 && editMode ? (
        <div className=" opacity-25 inline-flex items-center flex-col">
          <p className=" text-2xl">Layout empty</p>
          <span className="p-2 text-xs">
            Currently there are no plugins in this layout. Click the{" "}
            <span className=" font-black">Parking Lot</span> Button in the
            Bottom Left corner and drag some plugins into this layout.
          </span>
        </div>
      ) : null}
      {editMode && active ? (
        <DropTarget alignment="vertical" containerId={layout.identifier} />
      ) : null}
      {layout.children.map((e) => {
        if (e.type === "PluginCell") {
          return (
            <React.Fragment key={e.plugin_id}>
              <PluginCell layout={e} editMode={editMode} />
              {editMode && active && active.id !== e.plugin_id ? (
                <DropTarget
                  alignment="vertical"
                  containerId={layout.identifier}
                  afterId={e.plugin_id}
                />
              ) : null}
            </React.Fragment>
          );
        }
      })}
    </fieldset>
  );
}
