/**
 * This file was created in accordance to
 * https://github.com/EDCD/EDDN/blob/a4475a71772c149d271bf1b906d4fc82e7be913b/schemas/journal-README.md
 */

import { type JournalEvent_BI } from "@elite-dangerous-plugin-framework/journal";

type DockedEvent = Extract<JournalEvent_BI, { event: "Docked" }>;
type CarrierJumpEvent = Extract<JournalEvent_BI, { event: "CarrierJump" }>;
type FsdJumpEvent = Extract<JournalEvent_BI, { event: "FSDJump" }>;
type ScanEvent = Extract<JournalEvent_BI, { event: "Scan" }>;
type LocationEvent = Extract<JournalEvent_BI, { event: "Location" }>;
type SAAEvent = Extract<JournalEvent_BI, { event: "SAASignalsFound" }>;
type CodexEntryEvent = Extract<JournalEvent_BI, { event: "CodexEntry" }>;

export function extractAndStripJournal(ev: JournalEvent_BI) {
  switch (ev.event) {
    case "Docked":
      return stripDocked(ev);
    case "FSDJump":
      return stripFsdJump(ev);
    case "Scan":
      return stripScan(ev);
    case "Location":
      return stripLocation(ev);
    case "SAASignalsFound":
      return stripSAA(ev);
    case "CarrierJump":
      return stripCarrierJump(ev);
    case "CodexEntry":
      return stripCodexEntry(ev);
    default:
      return undefined;
  }
}

function stripCodexEntry(ev: CodexEntryEvent) {
  const {
    Name_Localised,
    Region_Localised,
    Category_Localised,
    SubCategory_Localised,
    NearestDestination_Localised,
    ...rest
  } = ev;
  return rest;
}

function stripSAA(ev: SAAEvent) {
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
  };
}

function stripLocation(ev: LocationEvent): Omit<
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
} {
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
      const { Happiness_Localised, ...rest } = e;
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
  };
}

function stripScan(ev: ScanEvent): Omit<ScanEvent, "Materials"> & {
  Materials:
    | undefined
    | Omit<NonNullable<ScanEvent["Materials"]>[number], "Name_Localised">[];
} {
  return {
    ...ev,
    Materials: ev.Materials?.map((e) => {
      const { Name_Localised, ...rest } = e;
      return rest;
    }),
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

function stripFsdJump(ev: FsdJumpEvent): Omit<
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
} {
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
  };
}

function stripDocked(
  ev: DockedEvent
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
> {
  const {
    StationName_Localised,
    StationEconomy_Localised,
    StationGovernment_Localised,
    Taxi,
    Multicrew,
    Wanted,
    CockpitBreach,
    ActiveFine,
    ...rest
  } = ev;

  return rest;
}

function stripCarrierJump(ev: CarrierJumpEvent): Omit<
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
} {
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
  };
}
