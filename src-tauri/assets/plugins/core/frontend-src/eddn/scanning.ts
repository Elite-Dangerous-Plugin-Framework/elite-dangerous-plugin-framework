import {
  type FSSAllBodiesFoundEvent_BI,
  type FSSBodySignalsEvent_BI,
  type FSSDiscoveryScanEvent_BI,
  type FSSSignalDiscoveredEvent_BI,
  type NavBeaconScanEvent_BI,
  type ScanBaryCentreEvent_BI,
} from "@elite-dangerous-plugin-framework/journal";
import type { LoadGame, SystemData } from "./eddn";

export function stripFssAllBodiesFound(
  ev: FSSAllBodiesFoundEvent_BI,
  systemData: SystemData,
  lg: LoadGame,
) {
  return {
    ...ev,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
    StarPos: systemData.starPos,
  };
}

export function stripFssDiscoveryScan(
  ev: FSSDiscoveryScanEvent_BI,
  systemData: SystemData,
  lg: LoadGame,
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
  ev: NavBeaconScanEvent_BI,
  systemData: SystemData,
  lg: LoadGame,
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
  ev: ScanBaryCentreEvent_BI,
  systemData: SystemData,
  lg: LoadGame,
) {
  return {
    ...ev,
    odyssey: lg.Odyssey,
    horizons: lg.Horizons,
    StarPos: systemData.starPos,
  };
}

export function stripAndExtractFSSSignalDiscovered(
  evs: FSSSignalDiscoveredEvent_BI[],
  systemData: SystemData,
  lg: LoadGame,
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
  ev: FSSBodySignalsEvent_BI,
  systemData: SystemData,
  lg: LoadGame,
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
