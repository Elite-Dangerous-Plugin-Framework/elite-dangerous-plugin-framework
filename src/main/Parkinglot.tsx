import { Active } from "@dnd-kit/core";
import { ChevronUp } from "../icons/parkingLot";
import { ParkingLotDropTarget } from "./layouts/DropTarget";
import PluginCell from "./layouts/PluginCell";

export interface ParkinglotProps {
  isParkingLotExpanded: boolean;
  setIsParkingLotExpanded: (_: boolean) => void;
  pluginsInParkingLot: string[];
  isEditMode: boolean;
  currentDraggingItem: Active | undefined;
}

export default function Parkinglot({
  isParkingLotExpanded,
  setIsParkingLotExpanded,
  pluginsInParkingLot,
  isEditMode,
  currentDraggingItem,
}: ParkinglotProps) {
  return (
    <div
      className={` fixed ${
        isParkingLotExpanded ? "bottom-0" : "-bottom-40"
      } w-full h-48 duration-200`}
    >
      <div className="flex flex-col h-full">
        <div className=" flex flex-row items-center gap-2">
          <button
            onClick={() => {
              setIsParkingLotExpanded(!isParkingLotExpanded);
            }}
            className={`h-8 flex flex-row items-center self-start cursor-pointer ${
              isParkingLotExpanded ? "bg-green-800" : "bg-green-700"
            } rounded-tr-lg gap-1 px-2`}
          >
            <span className=" text-lg">Parking Lot</span>
            <ChevronUp
              className={`w-8 h-8 duration-200 ease-in-out ${
                isParkingLotExpanded ? "rotate-180" : ""
              } `}
            />
          </button>
          <span
            className={` text-xs italic pointer-events-none ${
              isParkingLotExpanded ? "opacity-20" : "opacity-0"
            } duration-300`}
          >
            Parked plugins are still executed
          </span>
        </div>
        <section id="parking-lot-inner" className="relative h-full">
          <div className="flex flex-row max-w-full overflow-x-scroll h-full flex-1 bg-green-950">
            {pluginsInParkingLot ? (
              pluginsInParkingLot.length > 0 ? (
                pluginsInParkingLot.map((e) => (
                  <PluginCell
                    layout={{
                      type: "PluginCell",
                      plugin_id: e,
                      meta: isEditMode
                        ? {
                            max_width: "200px",
                            min_width: "200px",
                            max_height: "100px",
                          }
                        : {},
                    }}
                    editMode={true}
                    key={e}
                  />
                ))
              ) : (
                <div className=" opacity-40 w-full flex justify-center flex-col">
                  <p className=" text-2xl font-black text-center">Empty!</p>
                  <span className=" mx-2  ">
                    All your active plugins are on the main layout. Feeling
                    crammed? Drag your plugins into here to move them into the
                    parking lot
                  </span>
                </div>
              )
            ) : (
              <span>Loading…</span>
            )}
          </div>
          {currentDraggingItem && <ParkingLotDropTarget />}
        </section>
      </div>
    </div>
  );
}
