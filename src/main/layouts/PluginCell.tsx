import z from "zod";
import { PluginCellNodeZod } from "./types";
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
      console.log("pluginPortal", { reference });
      if (!divRef.current.shadowRoot) {
        divRef.current.attachShadow({ mode: "open" });
      }
      if (!divRef.current.shadowRoot) {
        throw new Error("illogical error: shadow Root is unset after creating");
      }
      divRef.current.shadowRoot.appendChild(reference);
    }
    if (divRef.current && divRef.current.shadowRoot) {
      for (const child of divRef.current.shadowRoot.children) {
        if (child !== reference) {
          child.remove();
        }
      }
    }
  }, [reference]);

  return (
    <div
      data-role="plugin_container"
      className="w-full h-full "
      ref={divRef}
    ></div>
  );
}

export default function PluginCell({ layout, editMode }: PluginCellProps) {
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
        //minWidth: min_width ?? undefined,
        //maxWidth: max_width ?? undefined,
        //minHeight: min_height ?? undefined,
        //maxHeight: max_height ?? undefined,
        borderColor: borderColour as any,
      }}
      className={`${
        editMode ? "relative rounded-lg mx-1 mt-1 border min-h-12" : ""
      }  ${active?.id === layout.plugin_id ? "animate-pulse opacity-15" : ""}`}
    >
      <div className={`${editMode ? "hidden" : " text-sm"}`}>
        <PluginPortal
          reference={
            pluginState?.currentUiState.type === "Running"
              ? pluginState.currentUiState.ref
              : undefined
          }
        ></PluginPortal>
      </div>
      {editMode && (
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          className="absolute top-0 left-0 w-full  h-full bg-black/20 cursor-move p-1"
        >
          <div className="flex flex-row h-full items-center ">
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
