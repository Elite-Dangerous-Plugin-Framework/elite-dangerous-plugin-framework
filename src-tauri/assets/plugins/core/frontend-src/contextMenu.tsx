import { shipSites, stationSites, systemSites } from "./cmdrPanel";

interface ContextMenuProps {
  hide: () => void;
  openSystem: (page: (typeof systemSites)[number]) => void;
  openStation: (page: (typeof stationSites)[number]) => void;
  openShip: (page: (typeof shipSites)[number]) => void;
  type: "system" | "station" | "ship";
  x: number;
  y: number;
}

export function ContextMenu({
  hide,
  openShip,
  openStation,
  openSystem,
  type,
  x,
  y,
}: ContextMenuProps) {
  const relevantFragment = (() => {
    switch (type) {
      case "system":
        return systemSites.map((e) => (
          <div
            key={e}
            className="px-3 py-1 hover:bg-neutral-700 cursor-pointer"
            onClick={() => {
              openSystem(e);
              hide();
            }}
          >
            Open in {e}
          </div>
        ));
      case "station":
        return stationSites.map((e) => (
          <div
            key={e}
            className="px-3 py-1 hover:bg-neutral-700 cursor-pointer"
            onClick={() => {
              openStation(e);
              hide();
            }}
          >
            Open in {e}
          </div>
        ));
      case "ship":
        return shipSites.map((e) => (
          <div
            key={e}
            className="px-3 py-1 hover:bg-neutral-700 cursor-pointer"
            onClick={() => {
              openShip(e);
              hide();
            }}
          >
            Open in {e}
          </div>
        ));
    }
  })();

  return (
    <div
      className="fixed z-50"
      onMouseLeave={() => hide()}
      style={{ top: y - 8, left: x - 8 }}
    >
      <div className="p-2">
        <div className="bg-neutral-900 border border-neutral-700 rounded shadow-md">
          {relevantFragment}
        </div>
      </div>
    </div>
  );
}
