import z from "zod";
import { VerticalNodeZod } from "./types";
import PluginCell from "./PluginCell";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import React, { act } from "react";
import DropTarget from "./DropTarget";

export interface VerticalLayoutProps {
  layout: z.infer<typeof VerticalNodeZod>;
  editMode: boolean;
}

export default function VerticalLayout({
  layout,
  editMode,
}: VerticalLayoutProps) {
  const { active } = useDndContext();

  return (
    <fieldset
      role="presentation"
      className={`flex flex-col  gap-1 ${
        editMode ? " border border-amber-700 rounded-lg mx-1" : ""
      }`}
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
              {editMode && active ? (
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

type Result<A, B> =
  | {
      ok: true;
      data: A;
    }
  | {
      ok: false;
      err: B;
    };

function Ok<A>(a: A) {
  return {
    ok: true as const,
    data: a,
  };
}
function Err<A>(a: A) {
  return {
    ok: false as const,
    err: a,
  };
}

function xdfas(a: Result<number, string>) {
  if (a.ok) {
  } else {
    a.err;
  }
}
