import { type JournalEvent_BI } from "@elite-dangerous-plugin-framework/journal";
import type { LoadGame, SystemData } from "./eddn";

type FSSAllBodiesFoundEvent = Extract<
  JournalEvent_BI,
  { event: "FSSAllBodiesFound" }
>;

type FSSDiscoveryScanEvent = Extract<
  JournalEvent_BI,
  { event: "FSSDiscoveryScan" }
>;

type FSSSignalDiscoveredEvent = Extract<
  JournalEvent_BI,
  { event: "FSSSignalDiscovered" }
>;

type FSSBodySignalsEvent = Extract<
  JournalEvent_BI,
  { event: "FSSBodySignals" }
>;

type NavBeaconScanEvent = Extract<JournalEvent_BI, { event: "NavBeaconScan" }>;
type ScanBaryCentreEvent = Extract<
  JournalEvent_BI,
  { event: "ScanBaryCentre" }
>;

export function stripFssAllBodiesFound(
  ev: FSSAllBodiesFoundEvent,
  systemData: SystemData,
  lg: LoadGame
) {
  return {
    ...ev,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
    StarPos: systemData.starPos,
  };
}

export function stripFssDiscoveryScan(
  ev: FSSDiscoveryScanEvent,
  systemData: SystemData,
  lg: LoadGame
) {
  const { Progress, ...rest } = ev;

  return {
    ...rest,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
    StarPos: systemData.starPos,
  };
}

export function stripNavBeaconScan(
  ev: NavBeaconScanEvent,
  systemData: SystemData,
  lg: LoadGame
) {
  return {
    ...ev,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
    StarPos: systemData.starPos,
    StarSystem: systemData.name,
  };
}

export function stripScanBaryCentre(
  ev: ScanBaryCentreEvent,
  systemData: SystemData,
  lg: LoadGame
) {
  return {
    ...ev,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
    StarPos: systemData.starPos,
  };
}

export function stripAndExtractFSSSignalDiscovered(
  evs: FSSSignalDiscoveredEvent[],
  systemData: SystemData,
  lg: LoadGame
) {
  const strippedEvs = evs
    .filter((e) => e.USSType !== "$USS_Type_MissionTarget;")
    .map((e) => {
      const signal = {
        SignalName: e.SignalName,
        SignalType: e.SignalType,
        IsStation: e.IsStation,
        timestamp: e.timestamp,
        USSType: e.USSType,
        SpawningState: e.SpawningState,
        SpawningFaction: e.SpawningFaction,
        SpawningPower: e.SpawningPower,
        OpposingPower: e.OpposingPower,
        ThreatLevel: e.ThreatLevel,
      };
      return signal;
    });
  if (strippedEvs.length === 0) {
    return undefined;
  }

  return {
    event: evs[0]!.event,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
    StarPos: systemData.starPos,
    SystemAddress: systemData.id,
    StarSystem: systemData.name,
    signals: strippedEvs,
    timestamp: evs[0]!.timestamp,
  };
}

export function stripFssBodySignals(
  ev: FSSBodySignalsEvent,
  systemData: SystemData,
  lg: LoadGame
) {
  const { Signals, ...rest } = ev;

  return {
    ...rest,
    Signals: Signals.map((s) => {
      const { Type_Localised, ...rest } = s;
      return rest;
    }),
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
    StarPos: systemData.starPos,
    SystemAddress: systemData.id,
    StarSystem: systemData.name,
  };
}
