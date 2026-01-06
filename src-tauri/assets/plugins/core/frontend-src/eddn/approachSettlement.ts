/**
 * This file was created in accordance to
 * https://github.com/EDCD/EDDN/blob/72905efab353a08f92b5ed836f0a2d3a272fb538/schemas/approachsettlement-README.md
 */

import { type JournalEvent_BI } from "@elite-dangerous-plugin-framework/journal";
import type { LoadGame, LoadGameAugmentation, SystemData } from "./eddn";

type ApproachSettlementEvent = Extract<
  JournalEvent_BI,
  { event: "ApproachSettlement" }
>;

type StrippedApproachSettlementEvent = Omit<
  ApproachSettlementEvent,
  | "Name_Localised"
  | "StationEconomy_Localised"
  | "StationGovernment_Localised"
  | "StationEconomies"
> & {
  StarSystem: string;
  StarPos: SystemData["starPos"];
  StationEconomies:
    | undefined
    | Omit<
        NonNullable<ApproachSettlementEvent["StationEconomies"]>[number],
        "Name_Localised"
      >[];
} & LoadGameAugmentation;

export function stripApproachSettlementEvent(
  ev: ApproachSettlementEvent,
  star: SystemData,
  lg: LoadGame
): StrippedApproachSettlementEvent {
  const {
    Name_Localised,
    StationEconomy_Localised,
    StationGovernment_Localised,
    StationEconomies,
    ...rest
  } = ev;
  return {
    ...rest,
    StationEconomies: StationEconomies?.map((e) => {
      const { Name_Localised, ...rest } = e;
      return rest;
    }),
    StarSystem: star.name,
    StarPos: star.starPos,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
  };
}
