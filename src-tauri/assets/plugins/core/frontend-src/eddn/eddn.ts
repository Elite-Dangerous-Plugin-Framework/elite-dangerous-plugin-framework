import {
  stringifyBigIntJSON,
  type JournalEvent_BI,
} from "@elite-dangerous-plugin-framework/journal";
import type { GameStateData } from "../gamestate";

export type SystemData = NonNullable<GameStateData["system"]>;
export type LoadGame = Extract<JournalEvent_BI, { event: "LoadGame" }>;
export type LoadGameAugmentation = {
  odyssey: LoadGame["Odyssey"];
  horizons: LoadGame["Horizons"];
};

interface EDDNMessage {
  $schemaRef: string;
  header: EddnHeader;
  message: object;
}

export interface EddnEmitter {
  emit(message: EDDNMessage): Promise<void>;
}

/**
 * By default we use the `NoopEddnEmitter`. This is replaced with the real Emitter once we encounter the game version
 * is a Live version and not Legacy.
 */
export class NoopEddnEmitter implements EddnEmitter {
  async emit(message: EDDNMessage) {
    return;
  }
}

export class RealEddnEmitter implements EddnEmitter {
  constructor(
    private baseUrl: string,
    private testing: boolean,
  ) {
    if (!this.baseUrl.endsWith("/")) {
      this.baseUrl += "/";
    }
  }

  async emit(message: EDDNMessage) {
    // Because BigInt's are not supported by JSON.stringify and because we cannot use `number` due to floating point precision breaking System IDs, we have to rely on a transformer
    // This means we turn BigInts into strings with a pre- and suffix, then trim said pre/suffix, leaving us with the number.
    if (this.testing) {
      message.$schemaRef += "/test";
    }

    const serializedPayload = stringifyBigIntJSON(message);

    const targetUrl = this.baseUrl + "upload/";

    const result = await fetch(targetUrl, {
      method: "POST",
      body: serializedPayload,
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!result.ok) {
      console.error("eddn non-happy response", {
        serializedPayload,
        message,
        resp: await result.text(),
        schema: message.$schemaRef,
      });
    } else {
      console.info("eddn happy", {
        serializedPayload,
        message,
        schema: message.$schemaRef,
      });
    }
  }
}

export type EddnHeader = NonNullable<ReturnType<typeof makeEddnHeader>>;

export function makeEddnHeader(
  edpfVersion: string,
  cmdr: string,
  header: Extract<JournalEvent_BI, { event: "Fileheader" }>,
) {
  return {
    uploaderID: cmdr,
    gameversion: header.gameversion,
    gamebuild: header.build,
    softwareName: "elite-dangerous-plugin-framework" as const,
    softwareVersion: edpfVersion,
  };
}
