import { useCallback, useState } from "react";
import { ContextMenu } from "./contextMenu";
import { calculateSLEFImportData } from "./ships";
import type { GameStateData } from "./gamestate";

export const shipSites = ["EDSY", "Coriolis"] as const;
export const stationSites = ["Inara", "Spansh"] as const;
export const systemSites = ["Inara", "Spansh"] as const;

export function CmdrPanel({
  state,
  openUrl,
  preferredShipSite,
  preferredStationSite,
  preferredSystemSite,
  pluginVersion,
}: {
  state: GameStateData;
  preferredShipSite: (typeof shipSites)[number];
  preferredStationSite: (typeof stationSites)[number];
  preferredSystemSite: (typeof systemSites)[number];
  openUrl: (url: string) => void;
  pluginVersion: string;
}) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "system" | "station" | "ship";
  } | null>(null);

  const openSystem = useCallback(
    (site: typeof preferredSystemSite) => {
      switch (site) {
        case "Inara":
          openUrl(
            `https://inara.cz/elite/starsystem/?search=${state.system!.id}`,
          );
          break;
        case "Spansh":
          openUrl(`https://www.spansh.co.uk/system/${state.system!.id}`);
          break;
      }
    },
    [openUrl, state],
  );

  const openStation = useCallback(
    (site: typeof preferredStationSite) => {
      switch (site) {
        case "Inara":
          openUrl(
            `https://inara.cz/elite/station/?search=${state.station!.id}`,
          );
          break;
        case "Spansh":
          openUrl(`https://www.spansh.co.uk/station/${state.station!.id}`);
          break;
      }
    },
    [openUrl, state],
  );

  const openShip = useCallback(
    (site: typeof preferredShipSite) => {
      if (state.vessel?.type !== "Ship") return;
      switch (site) {
        case "Coriolis":
          calculateSLEFImportData(state.vessel.slef, pluginVersion).then((e) =>
            openUrl(`https://coriolis.io/import?data=${e}`),
          );
          break;
        case "EDSY":
          calculateSLEFImportData(state.vessel.slef, pluginVersion).then((e) =>
            openUrl(`https://edsy.org/#/I=${e}`),
          );
          break;
      }
    },
    [openUrl, state],
  );

  return (
    <div className="grid grid-cols-[auto_1fr] w-full gap-x-2">
      <>
        <div>CMDR</div>
        <div>{state.cmdr}</div>
      </>
      {state.system && (
        <>
          <div>System</div>
          <div
            title={`Open in ${preferredSystemSite}${"\n"}Right click for more`}
            onClick={() => {
              openSystem(preferredSystemSite);
            }}
            onContextMenu={(ev) => {
              ev.preventDefault();
              setContextMenu({
                x: ev.clientX,
                y: ev.clientY,
                type: "system",
              });
            }}
            className="underline cursor-pointer"
          >
            {state.system.name}
          </div>
        </>
      )}
      {state.station && (
        <>
          <div className="">
            {state.station.situation.type === "docked" && (
              <span>docked at</span>
            )}
            {state.station.situation.type === "docking" && (
              <span>landing at</span>
            )}
            {state.station.situation.type === "vicinity" && <span>near </span>}
          </div>
          <div
            title={`Open in ${preferredStationSite}${"\n"}Right click for more`}
            onClick={() => openStation(preferredStationSite)}
            className="underline cursor-pointer"
            onContextMenu={(ev) => {
              ev.preventDefault();
              setContextMenu({
                x: ev.clientX,
                y: ev.clientY,
                type: "station",
              });
            }}
          >
            {state.station.name} ({state.station.stationType})
          </div>
        </>
      )}
      {state.vessel && state.vessel.type === "Ship" && (
        <>
          <div className="">Ship</div>
          <div
            title={`Open in ${preferredShipSite}${"\n"}Right click for more`}
            onClick={() => openShip(preferredShipSite)}
            className="underline cursor-pointer"
            onContextMenu={(ev) => {
              ev.preventDefault();
              setContextMenu({
                x: ev.clientX,
                y: ev.clientY,
                type: "ship",
              });
            }}
          >
            {state.vessel!.name}
          </div>
        </>
      )}
      {contextMenu && (
        <ContextMenu
          hide={() => setContextMenu(null)}
          openSystem={openSystem}
          openStation={openStation}
          openShip={openShip}
          type={contextMenu.type}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      )}
    </div>
  );
}
