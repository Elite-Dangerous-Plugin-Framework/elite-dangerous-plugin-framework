import {
  EDPFPluginElementV1Alpha,
  EDPFPluginSettingsElementV1Alpha,
  type PluginContextV1Alpha,
} from "@elite-dangerous-plugin-framework/core";
import { parseWithBigInt } from "@elite-dangerous-plugin-framework/journal";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { GameState, type GameStateData } from "./gamestate";
import { calculateSLEFImportData } from "./ships";

import { EddnPreferencesZod, SettingsRoot } from "./settings";
import type { PluginSettingsContextV1Alpha } from "@elite-dangerous-plugin-framework/core";
import type z from "zod";

export default class Main extends EDPFPluginElementV1Alpha {
  constructor() {
    super();
  }
  override initPlugin(ctx: PluginContextV1Alpha): void {
    ReactDOM.createRoot(this).render(<PluginRoot ctx={ctx} />);
  }
}

export class Settings extends EDPFPluginSettingsElementV1Alpha {
  override initSettings(ctx: PluginSettingsContextV1Alpha): void {
    ReactDOM.createRoot(this).render(<SettingsRoot ctx={ctx} />);
  }
}

/**
 * @returns true if both states are equal, false if there is any difference
 */
function eqUiState(
  a: GameStateData | undefined,
  b: GameStateData | undefined
): boolean {
  if ((!a && b) || (a && !b)) return false;
  if (!a && !b) return true;
  if (!a || !b) throw ""; // will never happen, just to please TS
  return JSON.stringify(a) === JSON.stringify(b);
}

const shipSites = ["EDSY", "Coriolis"] as const;
const stationSites = ["Inara", "Spansh"] as const;
const systemSites = ["Inara", "Spansh"] as const;

function CmdrPanel({
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
            `https://inara.cz/elite/starsystem/?search=${state.system!.id}`
          );
          break;
        case "Spansh":
          openUrl(`https://www.spansh.co.uk/system/${state.system!.id}`);
          break;
      }
    },
    [openUrl, state]
  );

  const openStation = useCallback(
    (site: typeof preferredStationSite) => {
      switch (site) {
        case "Inara":
          openUrl(
            `https://inara.cz/elite/station/?search=${state.station!.id}`
          );
          break;
        case "Spansh":
          openUrl(`https://www.spansh.co.uk/station/${state.station!.id}`);
          break;
      }
    },
    [openUrl, state]
  );

  const openShip = useCallback(
    (site: typeof preferredShipSite) => {
      if (state.vessel?.type !== "Ship") return;
      switch (site) {
        case "Coriolis":
          calculateSLEFImportData(state.vessel.slef, pluginVersion).then((e) =>
            openUrl(`https://coriolis.io/import?data=${e}`)
          );
          break;
        case "EDSY":
          calculateSLEFImportData(state.vessel.slef, pluginVersion).then((e) =>
            openUrl(`https://edsy.org/#/I=${e}`)
          );
          break;
      }
    },
    [openUrl, state]
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

interface ContextMenuProps {
  hide: () => void;
  openSystem: (page: (typeof systemSites)[number]) => void;
  openStation: (page: (typeof stationSites)[number]) => void;
  openShip: (page: (typeof shipSites)[number]) => void;
  type: "system" | "station" | "ship";
  x: number;
  y: number;
}

function ContextMenu({
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

function PluginRoot({ ctx }: { ctx: PluginContextV1Alpha }) {
  const journalStates = useRef<Record<string, GameState | "pending">>({});

  type Cmdr = string;
  const [uiState, setUiState] = useState<Record<Cmdr, GameStateData>>({});

  const handleGamestateEvent = useCallback(
    (ev: GameStateData | undefined, cmdr: string) => {
      if (!eqUiState(ev, uiState[cmdr])) {
        if (ev) {
          setUiState({
            ...uiState,
            [cmdr]: ev,
          });
        } else {
          const newUiState = { ...uiState };
          delete newUiState[cmdr];
          setUiState(newUiState);
        }
      }
    },
    []
  );

  useEffect(() => {
    const settingsListenerDestructor =
      ctx.Capabilities.Settings.registerSettingsChangedListener((k, v) => {
        if (k === "core.eddnPrefs") {
          const parsed = EddnPreferencesZod.safeParse(v);
          const prefs = parsed.success ? parsed.data : { enabled: true };
          Object.values(journalStates.current)
            .filter((e) => typeof e !== "string")
            .map((e) => (typeof e === "string" ? (undefined as never) : e))
            .forEach((e) => e.notifyEddnPrefsChanged(prefs));
        }
      });

    const eventListenerDestructor = ctx.registerEventListener((evs) => {
      const newEvents = evs.map((e) => ({
        ...e,
        event: parseWithBigInt(e.event),
      }));

      if (newEvents.length === 0) {
        return;
      }

      const { cmdr, file } = newEvents[0]!;
      const journalStateForFile = journalStates.current[file];
      if (journalStateForFile === "pending") {
        return; // debounce — a previous event  has already triggered the command and we are awaiting the response, which will initialize the state.
      }
      const needsNewGamestate =
        !journalStateForFile || journalStateForFile.file !== file;

      if (needsNewGamestate) {
        // this happens if we are starting EDMC during the runtime of the Game, or when a new journal is being written
        // if we have the `Fileheader` Item within our list of events, we can assume that it is the former case and that we didnt miss any events because of it.
        // if we do not have the `Fileheader`, we drop this event and refetch all events for a journal instead
        const hasFileheader = newEvents.some(
          (e) => e.event.event === "Fileheader"
        );

        if (hasFileheader) {
          // We have all the infos we need to spawn a new Plugin State
          const gs = GameState.fromInitialState(
            newEvents.map((e) => e.event),
            file,
            handleGamestateEvent,
            ctx.pluginMeta.version!
          );
          journalStates.current[file] = gs;

          ctx.Capabilities.Settings.getSetting("core.eddnPrefs").then((e) => {
            gs.notifyEddnPrefsChanged((e as any) ?? { enabled: true });
          });
        } else {
          // We drop the inbound events and instead just refetch the entire file
          journalStates.current[file] = "pending"; // discount Lock
          ctx.rereadCurrentJournals().then(async (e) => {
            // find the correct journal
            const relevantData = Object.values(e).find(
              (e) => e.length > 0 && e[0]!.file === file
            );

            if (!relevantData) {
              console.error(
                `tried to reread entire Journal for CMDR ${cmdr} in file ${file}, but fetching all journals did not return this information`
              );
              return;
            }
            const parsedJournals = relevantData.map((e) =>
              parseWithBigInt(e.event)
            );
            const gs = GameState.fromInitialState(
              parsedJournals,
              file,
              handleGamestateEvent,
              ctx.pluginMeta.version!
            );
            journalStates.current[file] = gs;
            ctx.Capabilities.Settings.getSetting("core.eddnPrefs").then((e) => {
              gs.notifyEddnPrefsChanged((e as any) ?? { enabled: true });
            });
          });
        }
      } else {
        journalStateForFile.notifyAboutEvents(
          newEvents.map((e) => e.event),
          true
        );
      }
    });
    ctx.rereadCurrentJournals().then(async (e) => {
      // find the correct journal
      for (const items of Object.values(e)) {
        const anyEntry = items.find(() => true);
        if (!anyEntry) {
          continue;
        }
        const { file } = anyEntry;

        const parsedJournals = items.map((e) => parseWithBigInt(e.event));
        const gs = GameState.fromInitialState(
          parsedJournals,
          file,
          handleGamestateEvent,
          ctx.pluginMeta.version!
        );
        journalStates.current[file] = gs;
        ctx.Capabilities.Settings.getSetting("core.eddnPrefs").then((e) => {
          gs.notifyEddnPrefsChanged((e as any) ?? { enabled: true });
        });
      }
    });

    return () => {
      eventListenerDestructor();
      settingsListenerDestructor();
    };
  }, []);

  const sortedUiStateKeys = Object.keys(uiState).toSorted();

  return (
    <>
      <link rel="stylesheet" href={ctx.assetsBase + "style.css"} />
      <div className=" flex flex-col gap-2 w-full p-2">
        {sortedUiStateKeys.length > 0 ? (
          sortedUiStateKeys.map((cmdr) => (
            <CmdrPanel
              key={cmdr}
              state={uiState[cmdr]!}
              preferredShipSite={"EDSY"}
              preferredStationSite={"Inara"}
              preferredSystemSite={"Inara"}
              openUrl={function (url: string): void {
                ctx.openUrl(url);
              }}
              pluginVersion={ctx.pluginMeta.version ?? "0.0.0-dev"}
            />
          ))
        ) : (
          <div className="animate-pulse">
            Awaiting game launch or journal update
          </div>
        )}
      </div>
    </>
  );
}
