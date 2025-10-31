import z from "zod";
import { PluginCellNodeZod } from "./types";
import { GripIcon } from "../../icons/parkingLot";
import { usePluginState } from "../hooks/usePluginState";
import { useEffect, useRef } from "react";
import { PluginStateUIData } from "../../settings/utils";
import { StatusIndicator } from "../../settings/Settings";
import { useDraggable } from "@dnd-kit/core";

export interface PluginCellProps {
  layout: z.infer<typeof PluginCellNodeZod>;
  editMode: boolean;
}

interface PluginPortalProps {
  reference: HTMLElement | undefined;
}

function PluginPortal({ reference }: PluginPortalProps) {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (divRef.current && reference) {
      divRef.current.append(reference);
    }
  }, [reference]);

  return <div ref={divRef}></div>;
}

export default function PluginCell({ layout, editMode }: PluginCellProps) {
  const { max_height, min_height, min_width, max_width } = layout.meta;

  const { attributes, listeners, setNodeRef, active } = useDraggable({
    id: layout.plugin_id,
    data: layout,
  });

  const pluginState = usePluginState(layout.plugin_id);
  const borderColour =
    PluginStateUIData[pluginState?.current_state.type ?? "Disabled"].colour;

  return (
    <div
      style={{
        minWidth: min_width ?? undefined,
        maxWidth: max_width ?? undefined,
        minHeight: min_height ?? undefined,
        maxHeight: max_height ?? undefined,
        borderColor: borderColour as any,
      }}
      className={`${
        editMode ? "rounded-lg mx-1 mt-1 border-1  min-h-12" : ""
      } relative ${
        active?.id === layout.plugin_id ? "animate-pulse opacity-15" : ""
      }`}
    >
      <div className={`${editMode ? "blur-xs pointer-events-none" : ""}`}>
        <PluginPortal
          reference={
            pluginState?.currentUiState.type === "Running"
              ? pluginState.currentUiState.ref
              : undefined
          }
        ></PluginPortal>
      </div>
      {editMode && (
        <div className="absolute top-0 left-0 w-full h-full bg-black/20  p-1">
          <div className="flex flex-row h-full items-center ">
            <button
              ref={setNodeRef}
              {...attributes}
              {...listeners}
              className="h-full w-6 cursor-move"
            >
              <GripIcon className="w-12 -ml-3 h-full" />
            </button>
            <div>
              <span className="flex items-center gap-1">
                {layout.plugin_id}{" "}
                <StatusIndicator
                  state={pluginState?.current_state.type ?? "FailedToStart"}
                />
              </span>
            </div>
            <div className="flex-1" />
          </div>
        </div>
      )}
    </div>
  );
}
