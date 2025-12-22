export interface EddnEmitter {}

/**
 * By default we use the `NoopEddnEmitter`. This is replaced with the real Emitter once we encounter the game version
 * is a Live version and not Legacy.
 */
export class NoopEddnEmitter implements EddnEmitter {}

export class RealEddnEmitter implements EddnEmitter {
  constructor(
    private baseUrl: string,
    private testing: boolean
  ) {}
}
