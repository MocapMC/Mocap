import { world, BoundingBox, MinecraftBlockTypes } from '@minecraft/server';

export enum WorldEvent {
  blockBreak = 'blockBreak',
  blockPlace = 'blockPlace',
}

const EventFunc: {
  [k in WorldEvent]: (state: WorldState, args: any[]) => void;
} = {
  blockBreak(state, args) {
    const block = state.dimension.getBlock(args[0]);
    if (!block) throw 'failed to get block';
    block.setType(MinecraftBlockTypes.air);
  },
  blockPlace(state, args) {
    const block = state.dimension.getBlock(args[0]);
    if (!block) throw 'failed to get block';
    block.setPermutation(args[1]);
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
