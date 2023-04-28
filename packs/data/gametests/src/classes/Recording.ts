import {
  Entity,
  BlockVolume,
  BlockVolumeUtils,
  world,
  system,
  Player,
  EquipmentSlot,
  EntityEquipmentInventoryComponent,
  Vector3,
  Vector,
  Vector2,
} from '@minecraft/server';
import { EntityEvent, EntityState } from './Entity';
import { PlaybackState } from '../enums/PlaybackState';
import { WorldEvent, WorldState } from './World';

interface EventSignal<c extends Function = Function> {
  subscribe(callback: c): c;
  unsubscribe(callback: c): void;
}

type EntityStateId = `r${number}_${string}`;

export class Recording {
  entityStates = new Map<
    EntityStateId,
    {
      id: string;
      created: number;
      state: EntityState;
      died: number;
      entity?: Entity;
      recordCount: number;
    }
  >();
  worldState: WorldState;

  state = PlaybackState.none;
  tick = 0;
  simTick = 0;
  length = 0;

  recordCount = 0;

  #recordIntervalId?: number;
  #simulateIntervalId?: number;

  constructor(id: string, dimension: string, area: BlockVolume) {
    const bbox = BlockVolumeUtils.getBoundingBox(area);
    this.worldState = new WorldState(id, dimension, bbox);

    this.saveStructure();
  }

  get id() {
    return this.worldState.id;
  }

  get bbox() {
    return this.worldState.bbox;
  }

  get dimension() {
    return this.worldState.dimension;
  }

  saveStructure() {
    const { min, max } = this.bbox;
    this.dimension.runCommand(
      `structure save "mocap:recording/${this.id}" ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z}`
    );
  }

  loadStructure() {
    const { min } = this.bbox;
    this.dimension.runCommand(
      `structure load "mocap:recording/${this.id}" ${min.x} ${min.y} ${min.z}`
    );
  }

  entityToStateId(e: Entity): EntityStateId {
    return `r${this.recordCount}_${e.id}`;
  }

  createEntity(e: Entity) {
    const state = new EntityState(
      e.typeId,
      e.dimension.id,
      e.location,
      e.getRotation(),
      e.nameTag
    );
    this.entityStates.set(this.entityToStateId(e), {
      // id: e.id,
      id: 'minecraft:armor_stand',
      created: this.tick,
      state,
      died: 2_000_000_000,
      entity: e,
      recordCount: this.recordCount,
    });
    state.addEvent(this.tick, EntityEvent.spawn);
    return state;
  }

  getEntity(e: string, create = false) {
    let entry;
    for (const [id, v] of this.entityStates) {
      if (id === e) entry = v;
    }

    if (entry && entry.recordCount !== this.recordCount) return;
    if (!entry) {
      if (!create || typeof e === 'string') throw 'Could not find entity state';
      entry = this.createEntity(e);
    } else entry = entry.state;
    return entry;
  }

  killEntity(id: EntityStateId) {
    const entry = this.entityStates.get(id);
    if (!entry) throw 'Could not find entity state';
    entry.died = this.tick;
    entry.state.addEvent(this.tick, EntityEvent.death);
  }

  addWorldEvent(event: WorldEvent, ...args: any[]) {
    const state = this.worldState;
    state.addEvent(this.tick, event, args);
  }

  addEntityEvent(e: string, event: EntityEvent, ...args: any[]) {
    const state = this.getEntity(e);
    if (!state) return;
    state.addEvent(this.tick, event, args);
  }

  #recordEvents: [EventSignal, Function][] = [];
  handleRecordEvent<signal extends EventSignal>(
    event: signal,
    callback: Parameters<signal['subscribe']>[0]
  ) {
    event.subscribe(callback);
    this.#recordEvents.push([event, callback]);
  }

  clearRecordEvents() {
    for (const [sig, call] of this.#recordEvents) sig.unsubscribe(call);

    this.#recordEvents = [];
  }

  resetRecording() {
    if (this.state !== PlaybackState.none || this.#recordIntervalId)
      throw 'Unable to start recording';

    this.entityStates.clear();
  }

  startRecording() {
    if (this.state !== PlaybackState.none || this.#recordIntervalId)
      throw 'Unable to start recording';

    this.tick = 0;
    this.state = PlaybackState.recording;

    if (this.length) {
      this.startSimulating(true);
    }
    // this.entityStates.clear();

    const d = this.dimension;
    for (const e of d.getEntities({
      location: { x: 0, y: 0, z: 0 },
      minDistance: 0,
    })) {
      this.createEntity(e);
      // console.warn(`${}`)
    }

    // this.handleRecordEvent(world.events.playerSpawn, (ev) =>
    //   this.addEntityEvent(ev.player, EntityEvent.join)
    // );
    // this.handleRecordEvent(world.events.playerLeave, (ev) =>
    //   this.addEntityEvent(ev.playerId, EntityEvent.leave)
    // );
    this.handleRecordEvent(world.afterEvents.entitySpawn, (ev) =>
      this.createEntity(ev.entity)
    );
    this.handleRecordEvent(world.afterEvents.entityDie, (ev) => {
      const e = ev.deadEntity;
      this.killEntity(`r${this.recordCount}_${e.id}`);
    });
    this.handleRecordEvent(world.afterEvents.entityHit, (ev) => {
      const e = ev.entity;
      const id = this.entityToStateId(e);
      this.addEntityEvent(id, EntityEvent.attack);
    });
    this.handleRecordEvent(world.afterEvents.entityHurt, (ev) => {
      const hurt = ev.hurtEntity;
      const id = this.entityToStateId(hurt);
      this.addEntityEvent(id, EntityEvent.hurt);
    });
    this.handleRecordEvent(world.afterEvents.blockBreak, (ev) => {
      this.addWorldEvent(WorldEvent.blockBreak, ev.block.location);
      this.addEntityEvent(this.entityToStateId(ev.player), EntityEvent.attack);
    });
    this.handleRecordEvent(world.afterEvents.blockPlace, (ev) => {
      const { location, permutation } = ev.block;
      this.addWorldEvent(WorldEvent.blockPlace, location, permutation);
      // this.addEntityEvent(this.entityToStateId(ev.player), EntityEvent.attack);
    });
    this.handleRecordEvent(world.afterEvents.itemUse, (ev) => {
      const e = ev.source;
      this.addEntityEvent(
        this.entityToStateId(e),
        EntityEvent.use,
        ev.itemStack
      );
    });

    const prevDatas: {
      [k: string]: {
        equipment: { -readonly [k in keyof typeof EquipmentSlot]?: string };
        loc: Vector3;
        rot: Vector2;
        vel: Vector3;
      };
    } = {};

    this.#recordIntervalId = system.runInterval(() => {
      for (const [e, entry] of this.entityStates) {
        if (entry.recordCount !== this.recordCount) continue;
        if (entry.died < this.tick) continue;

        const entity = entry.entity;
        if (!entity) {
          console.warn('y no entity :sob:');
          continue;
        }

        if (!prevDatas[entry.id])
          prevDatas[entry.id] = {
            equipment: {},
            loc: entity.location,
            rot: entity.getRotation(),
            vel: entity.getVelocity(),
          };
        const prevData = prevDatas[entry.id];

        const loc = entity.location;
        const prevLoc = prevData.loc;
        if (Vector.subtract(loc, prevLoc).length() > 0.1) {
          this.addEntityEvent(e, EntityEvent.position, entity.location);
        }

        const rot = entity.getRotation();
        const prevRot = prevData.rot;
        const difRot = { x: prevRot.x - rot.x, y: prevRot.y - rot.y };
        if (Math.sqrt(difRot.x * difRot.x + difRot.y * difRot.y) > 0.1) {
          this.addEntityEvent(e, EntityEvent.rotate, rot);
        }

        const vel = entity.getVelocity();
        const prevVel = prevData.vel;
        if (Vector.subtract(vel, prevVel).length() > 0.1) {
          this.addEntityEvent(e, EntityEvent.velocity, vel);
        }

        if (entity instanceof Player) {
          const inv = <EntityEquipmentInventoryComponent>(
            entity.getComponent('equipment_inventory')
          );
          for (const slotKey in EquipmentSlot) {
            const slot = EquipmentSlot[<keyof typeof EquipmentSlot>slotKey];
            const item = inv.getEquipment(slot);
            if (prevData.equipment[slot] !== item?.typeId) {
              this.addEntityEvent(e, EntityEvent.changeEquipment, slot, item);
              prevData.equipment[slot] = item?.typeId;
            }
          }
        }
      }
      this.tick++;
    }, 1);
  }

  stopRecording() {
    if (this.state !== PlaybackState.recording || !this.#recordIntervalId)
      throw 'No recording in progress';
    system.clearRun(this.#recordIntervalId);
    this.#recordIntervalId = undefined;
    this.state = PlaybackState.none;

    for (const [e, entry] of this.entityStates) {
      if (entry.died <= this.tick) continue;
      this.addEntityEvent(e, EntityEvent.despawn);
      entry.died = this.tick;
    }

    if (this.#simulateIntervalId) {
      try {
        this.stopSimulating();
      } catch (e) {
        console.error(e);
      }
    }

    this.clearRecordEvents();
    this.length = Math.max(this.tick, this.length);
    this.recordCount++;
  }

  startSimulating(recording = false) {
    if (this.#simulateIntervalId) throw 'Unable to start simulating';

    this.simTick = 0;
    if (!recording) this.state = PlaybackState.simulating;

    this.loadStructure();

    for (const [_, s] of this.entityStates) s.state.dereferenceEntity();

    this.#simulateIntervalId = system.runInterval(() => {
      if (!this.#simulateIntervalId) return;

      const t = this.simTick;
      if (t > this.length) {
        this.stopSimulating();
        return;
      }

      try {
        this.worldState.simulate(t);
      } catch (e) {
        console.error(e);
      }

      for (const e of this.entityStates.values()) {
        const { created, state, died, recordCount } = e;

        if (recording && recordCount == this.recordCount) continue;

        if (t < created || t > died) continue;
        try {
          if (t === created) {
            state.simulate(t, true);
            const id = state.entityId;
            if (!id) {
              console.warn('Failed to create entity');
              continue;
            }
            e.id = id;
          } else state.simulate(t);
        } catch (e) {
          console.warn(e);
        }
      }

      this.simTick++;
    }, 1);
  }

  stopSimulating() {
    if (!this.#simulateIntervalId) {
      throw 'No simulation in progress';
    }
    system.clearRun(this.#simulateIntervalId);
    this.#simulateIntervalId = undefined;
    if (this.state === PlaybackState.simulating) {
      this.state = PlaybackState.none;
    }

    for (const entry of this.entityStates.values()) {
      entry.state.kill();
    }
  }
}
