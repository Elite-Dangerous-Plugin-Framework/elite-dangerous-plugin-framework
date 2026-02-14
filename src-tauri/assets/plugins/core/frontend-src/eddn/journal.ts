/**
 * This file was created in accordance to
 * https://github.com/EDCD/EDDN/blob/a4475a71772c149d271bf1b906d4fc82e7be913b/schemas/journal-README.md
 */

import { type JournalEvent_BI } from "@elite-dangerous-plugin-framework/journal";
import type { LoadGame, LoadGameAugmentation, SystemData } from "./eddn";

type DockedEvent = Extract<JournalEvent_BI, { event: "Docked" }>;
type CarrierJumpEvent = Extract<JournalEvent_BI, { event: "CarrierJump" }>;
type FsdJumpEvent = Extract<JournalEvent_BI, { event: "FSDJump" }>;
type ScanEvent = Extract<JournalEvent_BI, { event: "Scan" }>;
type LocationEvent = Extract<JournalEvent_BI, { event: "Location" }>;
type SAAEvent = Extract<JournalEvent_BI, { event: "SAASignalsFound" }>;
type CodexEntryEvent = Extract<JournalEvent_BI, { event: "CodexEntry" }>;

type StrippedDocked = ReturnType<typeof stripDocked>;
type StrippedFsdJump = ReturnType<typeof stripFsdJump>;
type StrippedScan = ReturnType<typeof stripScan>;
type StrippedLocation = ReturnType<typeof stripLocation>;
type StrippedSAA = ReturnType<typeof stripSAA>;
type StrippedCarrierJump = ReturnType<typeof stripCarrierJump>;
type StrippedCodexEntry = ReturnType<typeof stripCodexEntry>;

type StarPos = Extract<JournalEvent_BI, { event: "Location" }>["StarPos"];

export function extractAndStripJournal(
  ev: JournalEvent_BI,
  systemData: SystemData,
  lg: LoadGame,
):
  | undefined
  | StrippedDocked
  | StrippedFsdJump
  | StrippedScan
  | StrippedLocation
  | StrippedSAA
  | StrippedCarrierJump
  | StrippedCodexEntry {
  switch (ev.event) {
    case "Docked":
      return stripDocked(ev, systemData.starPos, lg);
    case "FSDJump":
      return stripFsdJump(ev, lg);
    case "Scan":
      return stripScan(ev, systemData.starPos, lg);
    case "Location":
      return stripLocation(ev, lg);
    case "SAASignalsFound":
      return stripSAA(ev, systemData.name, systemData.starPos, lg);
    case "CarrierJump":
      return stripCarrierJump(ev, lg);
    case "CodexEntry":
      return stripCodexEntry(ev, systemData.starPos, lg);
    default:
      return undefined;
  }
}

function stripCodexEntry(ev: CodexEntryEvent, starPos: StarPos, lg: LoadGame) {
  const {
    Name_Localised,
    Region_Localised,
    Category_Localised,
    SubCategory_Localised,
    NearestDestination_Localised,
    ...rest
  } = ev;
  return {
    ...rest,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
    StarPos: starPos,
  };
}

function stripSAA(ev: SAAEvent, name: string, starPos: StarPos, lg: LoadGame) {
  return {
    ...ev,
    Signals: ev.Signals.map((e) => {
      const { Type_Localised, ...rest } = e;
      return rest;
    }),
    Genuses: ev.Genuses?.map((e) => {
      const { Genus_Localised, ...rest } = e;
      return rest;
    }),
    StarSystem: name,
    StarPos: starPos,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
  };
}

function stripLocation(
  ev: LocationEvent,
  lg: LoadGame,
): Omit<
  LocationEvent,
  | "Docked"
  | "OnFoot"
  | "Taxi"
  | "Multicrew"
  | "SystemEconomy_Localised"
  | "StationEconomy_Localised"
  | "SystemSecurity_Localised"
  | "SystemGovernment_Localised"
  | "StationGovernment_Localised"
  | "SystemSecondEconomy_Localised"
  | "StationEconomies"
  | "Factions"
  | "Conflicts"
> & {
  StationEconomies:
    | undefined
    | Omit<
        NonNullable<LocationEvent["StationEconomies"]>[number],
        "Name_Localised"
      >[];
  Factions: undefined | StrippedFaction[];
  Conflicts: undefined | StrippedConflict[];
} & LoadGameAugmentation {
  const {
    Docked,
    OnFoot,
    Taxi,
    Multicrew,
    SystemEconomy_Localised,
    StationEconomy_Localised,
    SystemSecurity_Localised,
    SystemGovernment_Localised,
    StationGovernment_Localised,
    SystemSecondEconomy_Localised,
    ...rest
  } = ev;

  return {
    ...rest,
    StationEconomies: rest.StationEconomies?.map((e) => {
      const { Name_Localised, ...rest } = e;
      return rest;
    }),
    Factions: rest.Factions?.map((e) => {
      const { Happiness_Localised, MyReputation, ...rest } = e;
      return rest;
    }),
    Conflicts: rest.Conflicts?.map((e) => {
      function stripFaction(f: (typeof e)["Faction1"]) {
        const { Stake_Localised, ...r } = f;
        return r;
      }

      return {
        ...e,
        Faction1: stripFaction(e.Faction1),
        Faction2: stripFaction(e.Faction2),
      };
    }),
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
  };
}

function stripScan(
  ev: ScanEvent,
  starPos: StarPos,
  lg: LoadGame,
): Omit<ScanEvent, "Materials"> & {
  Materials:
    | undefined
    | Omit<NonNullable<ScanEvent["Materials"]>[number], "Name_Localised">[];
  StarPos: StarPos;
} & LoadGameAugmentation {
  return {
    ...ev,
    Materials: ev.Materials?.map((e) => {
      const { Name_Localised, ...rest } = e;
      return rest;
    }),
    StarPos: starPos,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
  };
}

type StrippedFaction = Omit<
  NonNullable<FsdJumpEvent["Factions"]>[number],
  | "Happiness_Localised"
  | "HomeSystem"
  | "MyReputation"
  | "SquadronFaction"
  | "HappiestSystem"
>;
type StrippedConflictFaction = Omit<
  NonNullable<FsdJumpEvent["Conflicts"]>[number]["Faction1"],
  "Stake_Localised"
>;
type StrippedConflict = Omit<
  NonNullable<FsdJumpEvent["Conflicts"]>[number],
  "Faction1" | "Faction2"
> & { Faction1: StrippedConflictFaction; Faction2: StrippedConflictFaction };

function stripStationEconomies(
  input: NonNullable<DockedEvent["StationEconomies"]>[number],
): Omit<
  NonNullable<DockedEvent["StationEconomies"]>[number],
  "Name_Localised"
> {
  const { Name_Localised, ...rest } = input;
  return rest;
}

function stripFsdJump(
  ev: FsdJumpEvent,
  lg: LoadGame,
): Omit<
  FsdJumpEvent,
  | "SystemEconomy_Localised"
  | "SystemSecurity_Localised"
  | "SystemGovernment_Localised"
  | "SystemSecondEconomy_Localised"
  | "Taxi"
  | "Multicrew"
  | "Factions"
  | "Conflicts"
  | "FuelLevel"
  | "FuelUsed"
  | "JumpDist"
> & {
  Factions: undefined | StrippedFaction[];
  Conflicts: undefined | StrippedConflict[];
} & LoadGameAugmentation {
  const {
    SystemEconomy_Localised,
    SystemSecurity_Localised,
    SystemGovernment_Localised,
    SystemSecondEconomy_Localised,
    Taxi,
    Multicrew,
    FuelLevel,
    FuelUsed,
    JumpDist,
    BoostUsed,
    ...rest
  } = ev;

  return {
    ...rest,
    Factions: rest.Factions?.map((e) => {
      const {
        Happiness_Localised,
        HappiestSystem,
        HomeSystem,
        MyReputation,
        SquadronFaction,
        ...rest
      } = e;
      return rest;
    }),
    Conflicts: rest.Conflicts?.map((e) => {
      function stripFaction(f: (typeof e)["Faction1"]) {
        const { Stake_Localised, ...r } = f;
        return r;
      }

      return {
        ...e,
        Faction1: stripFaction(e.Faction1),
        Faction2: stripFaction(e.Faction2),
      };
    }),
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
  };
}

function stripDocked(
  ev: DockedEvent,
  starPos: StarPos,
  lg: LoadGame,
): Omit<
  DockedEvent,
  | "StationName_Localised"
  | "StationEconomy_Localised"
  | "StationGovernment_Localised"
  | "Taxi"
  | "Multicrew"
  | "Wanted"
  | "CockpitBreach"
  | "ActiveFine"
  | "StationEconomies"
> & {
  StarPos: StarPos;
  StationEconomies:
    | undefined
    | Omit<
        NonNullable<LocationEvent["StationEconomies"]>[number],
        "Name_Localised"
      >[];
} & LoadGameAugmentation {
  const {
    StationName_Localised,
    StationEconomy_Localised,
    StationGovernment_Localised,
    Taxi,
    Multicrew,
    Wanted,
    CockpitBreach,
    ActiveFine,
    StationEconomies,
    ...rest
  } = ev;
  return {
    ...rest,
    StarPos: starPos,
    StationEconomies: StationEconomies?.map(stripStationEconomies),
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
  };
}

function stripCarrierJump(
  ev: CarrierJumpEvent,
  lg: LoadGame,
): Omit<
  CarrierJumpEvent,
  | "Docked"
  | "OnFoot"
  | "Taxi"
  | "Multicrew"
  | "SystemEconomy_Localised"
  | "StationEconomy_Localised"
  | "SystemSecurity_Localised"
  | "SystemGovernment_Localised"
  | "StationGovernment_Localised"
  | "SystemSecondEconomy_Localised"
  | "StationEconomies"
  | "Factions"
  | "Conflicts"
> & {
  StationEconomies:
    | undefined
    | Omit<
        NonNullable<LocationEvent["StationEconomies"]>[number],
        "Name_Localised"
      >[];
  Factions: undefined | StrippedFaction[];
  Conflicts: undefined | StrippedConflict[];
} & LoadGameAugmentation {
  const {
    Docked,
    OnFoot,
    Taxi,
    Multicrew,
    SystemEconomy_Localised,
    StationEconomy_Localised,
    SystemSecurity_Localised,
    SystemGovernment_Localised,
    StationGovernment_Localised,
    SystemSecondEconomy_Localised,
    ...rest
  } = ev;

  return {
    ...rest,
    StationEconomies: rest.StationEconomies?.map((e) => {
      const { Name_Localised, ...rest } = e;
      return rest;
    }),
    Factions: rest.Factions?.map((e) => {
      const {
        Happiness_Localised,
        HappiestSystem,
        HomeSystem,
        MyReputation,
        SquadronFaction,
        ...rest
      } = e;
      return rest;
    }),
    Conflicts: rest.Conflicts?.map((e) => {
      function stripFaction(f: (typeof e)["Faction1"]) {
        const { Stake_Localised, ...r } = f;
        return r;
      }

      return {
        ...e,
        Faction1: stripFaction(e.Faction1),
        Faction2: stripFaction(e.Faction2),
      };
    }),
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
  };
}
