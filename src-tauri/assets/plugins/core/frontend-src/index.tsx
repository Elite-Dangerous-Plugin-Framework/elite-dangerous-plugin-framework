import { parseWithBigInt } from "@elite-dangerous-plugin-framework/journal";
import { useCallback, useEffect, useRef, useState } from "react";
import { eqUiState, GameState, type GameStateData } from "./gamestate";

import { EddnPreferencesZod, SettingsRoot } from "./settings";
import {
  makePluginV1Alpha,
  makeSettingsV1Alpha,
  useJournalEvents,
  usePluginContext,
  usePluginSetting,
} from "@elite-dangerous-plugin-framework/react/v1alpha";
import { z } from "zod";
import { CmdrPanel } from "./cmdrPanel";

export default makePluginV1Alpha(<PluginRoot />);
export const Settings = makeSettingsV1Alpha(<SettingsRoot />);

function PluginRoot() {
  const journalStates = useRef<Record<string, GameState | "pending">>({});
  type Cmdr = string;
  const [uiState, setUiState] = useState<Record<Cmdr, GameStateData>>({});
  const [eddnPrefs, _, eddnPrefsReady] =
    usePluginSetting<z.infer<typeof EddnPreferencesZod>>(".eddnPrefs");
  const ctx = usePluginContext();

  useEffect(() => {
    if (!eddnPrefsReady) {
      return;
    }
    const parsed = EddnPreferencesZod.safeParse(eddnPrefs);
    const prefs = parsed.success ? parsed.data : { enabled: true };
    Object.values(journalStates.current)
      .filter((e) => typeof e !== "string")
      .map((e) => (typeof e === "string" ? (undefined as never) : e))
      .forEach((e) => e.notifyEddnPrefsChanged(prefs));
  }, [eddnPrefs, eddnPrefsReady]);

  useJournalEvents("jsonBigint", ({ cmdr, events, file }) => {
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
      const hasFileheader = events.some((e) => e.event === "Fileheader");

      if (hasFileheader) {
        // We have all the infos we need to spawn a new Plugin State
        const gs = GameState.fromInitialState(
          events,
          file,
          handleGamestateEvent,
          ctx.pluginMeta.version!,
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
            (e) => e.length > 0 && e[0]!.file === file,
          );

          if (!relevantData) {
            console.error(
              `tried to reread entire Journal for CMDR ${cmdr} in file ${file}, but fetching all journals did not return this information`,
            );
            return;
          }
          const parsedJournals = relevantData.map((e) =>
            parseWithBigInt(e.event),
          );
          const gs = GameState.fromInitialState(
            parsedJournals,
            file,
            handleGamestateEvent,
            ctx.pluginMeta.version!,
          );
          journalStates.current[file] = gs;
          ctx.Capabilities.Settings.getSetting("core.eddnPrefs").then((e) => {
            gs.notifyEddnPrefsChanged((e as any) ?? { enabled: true });
          });
        });
      }
    } else {
      journalStateForFile.notifyAboutEvents(events, true);
    }
  });

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
    [],
  );

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
