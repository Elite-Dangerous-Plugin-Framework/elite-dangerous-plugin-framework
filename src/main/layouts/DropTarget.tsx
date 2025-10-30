import { useDroppable } from "@dnd-kit/core";

export interface DropTargetProps {
  alignment: "vertical"; // we can have horizontal here later
  /**
   * if true, the drop zone is grayed out. If set, one cannot deposit items at this location
   */
  locked?: boolean;
  /**
   * The reference of the parent. Must always be set
   */
  containerId: string;
  /**
   * The ID of the previous element. If missing, we can assume this is the first item in the container
   */
  afterId?: string;
}

export default function DropTarget({
  locked,
  containerId,
  afterId,
}: DropTargetProps) {
  const droppableId = `${containerId}-${afterId ?? "initial"}`;
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
    disabled: locked,
    data: { afterId, containerId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`h-12 -mt-6 -mb-6 flex items-center text-center rounded-lg ${
        locked
          ? " bg-red-700 cursor-no-drop"
          : isOver
          ? "bg-green-700"
          : "bg-green-900"
      }`}
    >
      {isOver && <p className="text-center w-full">Release to place plugin</p>}
    </div>
  );
}
