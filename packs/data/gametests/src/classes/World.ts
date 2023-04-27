import { world, BoundingBox } from '@minecraft/server';

export enum WorldEvent {
  blockBreak = 'blockBreak',
}

const EventFunc: {
  [k in WorldEvent]: (state: WorldState, args: any[]) => void;
} = {
  blockBreak(state, args) {
    state.dimension;
  },
};

export class WorldState {
  #events = new Map<number, [WorldEvent, any[]][]>();

  constructor(
    public id: string,
    public dimensionId: string,
    public bbox: BoundingBox
  ) {}

  get dimension() {
    return world.getDimension(this.dimensionId);
  }

  addEvent(tick: number, event: WorldEvent, args: any[] = []) {
    let evs = this.#events.get(tick) ?? [];
    if (!evs.length) this.#events.set(tick, evs);
    evs.push([event, args]);
  }

  spawn() {}

  simulate(tick: number) {
    const evs = this.#events.get(tick);
    if (!evs) return;
    for (let i = 0; i < evs.length; i++) {
      const [id, args] = evs[i];
      EventFunc[id](this, args);
    }
  }

  kill() {}
}
