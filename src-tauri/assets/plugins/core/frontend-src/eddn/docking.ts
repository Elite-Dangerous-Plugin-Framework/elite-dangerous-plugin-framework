/**
 * This file was created in accordance to
 * https://github.com/EDCD/EDDN/blob/a4475a71772c149d271bf1b906d4fc82e7be913b/schemas/dockinggranted-README.md
 * https://github.com/EDCD/EDDN/blob/a4475a71772c149d271bf1b906d4fc82e7be913b/schemas/dockingdenied-README.md
 */

import { type JournalEvent_BI } from "@elite-dangerous-plugin-framework/journal";
import type { LoadGame } from "./eddn";

type DockingGrantedEvent = Extract<
  JournalEvent_BI,
  { event: "DockingGranted" }
>;
type DockingDeniedEvent = Extract<JournalEvent_BI, { event: "DockingDenied" }>;

export function stripDockingDeniedEvent(ev: DockingDeniedEvent, lg: LoadGame) {
  const { StationName_Localised, ...rest } = ev;
  return {
    ...rest,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
  };
}

export function stripDockingGrantedEvent(
  ev: DockingGrantedEvent,
  lg: LoadGame
) {
  const { StationName_Localised, ...rest } = ev;
  return {
    ...rest,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
  };
}
