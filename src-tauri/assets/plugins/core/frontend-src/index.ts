import {
  EDPFPluginElementV1Alpha,
  type PluginContextV1Alpha,
  type PluginSettingsContextV1Alpha,
} from "@elite-dangerous-plugin-framework/core";
import {
  parseWithBigInt,
  type JournalEvent_BI,
} from "@elite-dangerous-plugin-framework/journal";
import type FileheaderEvent_BI from "@elite-dangerous-plugin-framework/journal/dist/generated/Fileheader.bi";

interface EddnEmitter {}

/**
 * By default we use the `NoopEddnEmitter`. This is replaced with the real Emitter once we encounter the game version
 * is a Live version and not Legacy.
 */
class NoopEddnEmitter implements EddnEmitter {}

class RealEddnEmitter implements EddnEmitter {
  constructor(
    private baseUrl: string,
    private testing: boolean,
  ) {}
}

/**
 * The gamestate essentially defines the "state" of the game. This is inferred by aggregating all events for a journal.
 * Do note that we turn off EDDN Emitting is on a Legacy Client.
 */
class GameState {
  /**
   * The header MUST be present before using EDDN. If this is missing, we reject emitting to EDDN
   */
  #header: FileheaderEvent_BI | undefined;
  #cmdr: string | undefined;
  #eddnEmitter: EddnEmitter = new NoopEddnEmitter();

  public notifyAboutEvent(ev: JournalEvent_BI) {
    switch (ev.event) {
      case "Fileheader":
        this.#header = ev;
        return;
      case "Commander":
        this.#cmdr = ev.Name;
        return;
    }
  }

  public static fromInitialState(evs: JournalEvent_BI[]) {
    const state = new GameState();
    evs.forEach((e) => state.notifyAboutEvent(e));
    return state;
  }
}

export default class Main extends EDPFPluginElementV1Alpha {
  constructor() {
    super();
  }
  #styleUrl = "";

  override initPlugin(ctx: PluginContextV1Alpha): void {
    this.#styleUrl = ctx.assetsBase + "style.css";
    ctx.rereadCurrentJournals().then((e) => {
      Object.entries(e).map(([cmdr, data]) => [
        cmdr,
        [GameState.fromInitialState(data.map((e) => parseWithBigInt(e.event)))],
      ]);
    });
    ctx.registerEventListener((events) => {
      for (const ev of events) {
        try {
          const event = parseWithBigInt(ev.event);
          this.#handleNewEvent(ev.cmdr, ev.file, event);
        } catch (e) {
          console.error("failed to handle event", { e });
        }
      }
    });
    this.#render();
  }

  #state: Record<string, [string, GameState]> = {};

  #handleNewEvent(cmdr: String, file: String, eventStr: JournalEvent_BI) {}

  #render() {
    this.innerHTML = `
    <link rel="stylesheet" href="${this.#styleUrl}" />
    <section>
      <p>Hello World!</p>
    </section>`;
  }
}
