import {
  Vector3,
  Vector2,
  Vector,
  system,
  world,
  Entity,
  MinecraftEffectTypes,
  EntityEquipmentInventoryComponent,
} from '@minecraft/server';
import { SimulatedPlayer, Test, register } from '@minecraft/server-gametest';

export enum EntityEvent {
  attack = 'attack',
  spawn = 'spawn',
  despawn = 'despawn',
  death = 'death',
  hurt = 'hurt',
  rotate = 'rotate',
  position = 'position',
  velocity = 'velocity',
  changeEquipment = 'changeEquipment',
}

let TEST: Test;

register('mbgr', 'players', (test) => {
  TEST = test;
})
  .maxTicks(2_000_000_000)
  .structureName('mbgr:players');

world.getDimension('overworld').runCommand('gametest run mbgr:players');

const EventFunc: {
  [k in EntityEvent]: (entity: Entity, state: EntityState, args: any[]) => void;
} = {
  attack(entity) {
    if (entity instanceof SimulatedPlayer) entity.attack();
  },
  spawn(entity, state, _) {
    state.spawn();
  },
  despawn(entity, state, _) {
    state.kill();
  },
  death(entity, state, _) {
    entity.kill();
    state.dead = true;
  },
  hurt(entity) {
    entity.applyDamage(1);
  },
  rotate(entity, _, args) {
    entity.setRotation(args[0]);
  },
  position(entity, _, args) {
    if (
      entity.typeId == 'minecraft:player' &&
      Vector.distance(args[0], entity.location) < 1.5
    )
      return;

    let opts = {};
    if (entity.typeId != 'minecraft:player') {
      opts = { keepVelocity: true };
    }
    entity.teleport(args[0], opts);
  },
  velocity(entity, _, args) {
    // if (Vector.distance(args[0], entity.getVelocity()) < 0.05) return;

    // if (entity.typeId == 'minecraft:player') return;

    entity.clearVelocity();
    entity.applyImpulse(args[0]);
  },
  changeEquipment(entity, _, args) {
    if (!(entity instanceof SimulatedPlayer)) return;

    const inv = <EntityEquipmentInventoryComponent>(
      entity.getComponent('equipment_inventory')
    );
    inv.setEquipment(args[0], args[1]);
    entity.selectedSlot = 0; // Required to update rendered item
  },
};

let actId = 0;
export class EntityState {
  #events = new Map<number, [EntityEvent, any[]][]>();

  #init_pos: Vector3;
  #init_rot: Vector2;

  #entity?: Entity;
  dead = false;

  get entityId() {
    return this.#entity?.id;
  }

  constructor(
    public id: string,
    public dimension: string,
    pos: Vector3,
    rot: Vector2,
    public nameTag: string
  ) {
    this.#init_pos = pos;
    this.#init_rot = rot;
  }

  addEvent(tick: number, event: EntityEvent, args: any[] = []) {
    let evs = this.#events.get(tick) ?? [];
    if (!evs.length) this.#events.set(tick, evs);
    evs.push([event, args]);
  }

  spawn() {
    if (this.#entity) throw 'Entity for this state already exists';

    const d = world.getDimension(this.dimension);

    let e: Entity;
    if (this.id == 'minecraft:player') {
      const rel = TEST.relativeBlockLocation(this.#init_pos);
      const idStr = `${actId}`.replace(/./g, '§$&');
      e = TEST.spawnSimulatedPlayer(rel, `Actor${idStr}§e`);
      actId += 1;
    } else {
      e = d.spawnEntity(this.id, this.#init_pos);
    }

    e.nameTag = this.nameTag;
    e.setRotation(this.#init_rot);
    e.addEffect(MinecraftEffectTypes.resistance, 2_100_000_000, 255, false);

    this.#entity = e;
    this.dead = false;

    return e.id;
  }

  simulate(tick: number, bypass = false) {
    let e = this.#entity;
    if (!e && !bypass)
      throw "Cannot simulate an entity that hasn't been spawned";

    const evs = this.#events.get(tick);
    if (!evs) return;
    for (let i = 0; i < evs.length; i++) {
      const [id, args] = evs[i];
      EventFunc[id](e!, this, args);
      if (!e) e = this.#entity;
    }
  }

  kill() {
    const e = this.#entity;
    if (!e) throw 'Entity for this state doesnt exist';
    if (!this.dead) {
      if (this.id == 'minecraft:player') {
        (<SimulatedPlayer>e).disconnect();
      } else {
        e.teleport(Vector.add(e.location, { x: 0, y: 300, z: 0 }));
        system.runTimeout(() => {
          try {
            e.kill();
          } catch {}
        }, 4);
      }
    }
    this.dereferenceEntity();
  }

  dereferenceEntity() {
    this.#entity = undefined;
  }
}
