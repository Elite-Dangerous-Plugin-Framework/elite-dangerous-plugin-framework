import { useDroppable } from "@dnd-kit/core";
import { ParkingLotIcon } from "../../icons/parkingLot";

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
          : "bg-green-900 animate-pulse"
      }`}
    >
      {isOver && <p className="text-center w-full">Release to place plugin</p>}
      {!isOver && (
        <p className="text-center w-full">Drag here to place plugin</p>
      )}
    </div>
  );
}

export function ParkingLotDropTarget() {
  const { setNodeRef: parkingLogRef, isOver: isOverParkingLot } = useDroppable({
    id: "\t@parkinglot",
  });

  return (
    <div
      ref={parkingLogRef}
      className="absolute w-full h-full rounded-3xl top-0 left-0 p-2 "
    >
      <div
        className={` duration-200 ease-in-out flex items-center justify-center flex-row border-2 border-dashed h-full rounded-xl border-green-600  backdrop-blur-sm ${
          isOverParkingLot ? "bg-green-200/40  gap-3" : "bg-green-500/20 gap-2 "
        }`}
      >
        <ParkingLotIcon className="w-12 h-12" />
        <p className="text-2xl">Move to parking lot</p>
      </div>
    </div>
  );
}
