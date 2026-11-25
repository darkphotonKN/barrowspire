import { describe, it, expect } from 'vitest';
import {
  getItemType,
  getValidSlotsForItem,
  equipSlotFor,
  EquippedItems,
  getSlotDisplayName,
  isGameState,
  placedKind,
  knownBarrier,
  knownSealPiece,
  knownTrap,
  ClientGameState,
  ItemState,
  EquipmentSlot,
  type PublicPlayerState,
} from './gameState';

function makeItem(overrides: Partial<ItemState> = {}): ItemState {
  return {
    item_id: 'template-1',
    entity_id: 'entity-1',
    name: 'Test Item',
    quantity: 1,
    ...overrides,
  };
}

describe('getItemType', () => {
  it('should return weapon when item has attack_power', () => {
    expect(getItemType(makeItem({ attack_power: 10 }))).toBe('weapon');
  });

  it('should return weapon when item has weapon_type', () => {
    expect(getItemType(makeItem({ weapon_type: 'sword' }))).toBe('weapon');
  });

  it('should return armor when item has defense_rating', () => {
    expect(getItemType(makeItem({ defense_rating: 5 }))).toBe('armor');
  });

  it('should return armor when item has armor_slot', () => {
    expect(getItemType(makeItem({ armor_slot: 'chest' }))).toBe('armor');
  });

  it('should return armor when defense_rating is 0', () => {
    expect(getItemType(makeItem({ defense_rating: 0, armor_slot: 'head' }))).toBe('armor');
  });

  it('should return consumable when item has healing_amount', () => {
    expect(getItemType(makeItem({ healing_amount: 50 }))).toBe('consumable');
  });

  it('should return consumable when item has mana_amount', () => {
    expect(getItemType(makeItem({ mana_amount: 30 }))).toBe('consumable');
  });

  it('should read an item with no weapon, armour or restorative stats as a ring (the run names no type)', () => {
    expect(getItemType(makeItem({ affixes: [{ stat: 'strength', tier: 1, value: 2 }] }))).toBe('ring');
    expect(getItemType(makeItem())).toBe('ring');
  });

  it.each([
    ['ring', 'ring'],
    ['Ring', 'ring'],
    ['weapon', 'weapon'],
    ['armor', 'armor'],
    ['consumable', 'consumable'],
    ['trinket', 'unknown'],
  ] as const)('should take a named item_type %s as %s', (named, want) => {
    expect(getItemType(makeItem({ item_type: named, attack_power: 3 }))).toBe(want);
  });
});

describe('getValidSlotsForItem', () => {
  it('should return [weapon] for weapon items', () => {
    expect(getValidSlotsForItem(makeItem({ attack_power: 10 }))).toEqual(['weapon']);
  });

  it('should return [head] for armor with armor_slot=head', () => {
    expect(getValidSlotsForItem(makeItem({ defense_rating: 5, armor_slot: 'head' }))).toEqual(['head']);
  });

  it('should return [body] for armor with armor_slot=chest', () => {
    expect(getValidSlotsForItem(makeItem({ defense_rating: 5, armor_slot: 'chest' }))).toEqual(['body']);
  });

  it('should return [hands] for armor with armor_slot=gloves', () => {
    expect(getValidSlotsForItem(makeItem({ defense_rating: 5, armor_slot: 'gloves' }))).toEqual(['hands']);
  });

  it('should return [feet] for armor with armor_slot=legs', () => {
    expect(getValidSlotsForItem(makeItem({ defense_rating: 5, armor_slot: 'legs' }))).toEqual(['feet']);
  });

  it('should return empty array for armor with unrecognized armor_slot', () => {
    expect(getValidSlotsForItem(makeItem({ defense_rating: 5, armor_slot: 'unknown_slot' }))).toEqual([]);
  });

  it('should return all consumable slots for consumable items', () => {
    expect(getValidSlotsForItem(makeItem({ healing_amount: 50 }))).toEqual(['consumable_1', 'consumable_2', 'consumable_3']);
  });

  it('should return both ring slots for a ring', () => {
    expect(getValidSlotsForItem(makeItem({ item_type: 'ring' }))).toEqual(['ring_1', 'ring_2']);
    expect(getValidSlotsForItem(makeItem({ affixes: [] }))).toEqual(['ring_1', 'ring_2']);
  });

  it('should return empty array for an item of a type it does not know', () => {
    expect(getValidSlotsForItem(makeItem({ item_type: 'trinket' }))).toEqual([]);
  });

  it('should return empty array for armor with no armor_slot', () => {
    expect(getValidSlotsForItem(makeItem({ defense_rating: 0, armor_slot: undefined }))).toEqual([]);
  });
});

describe('equipSlotFor', () => {
  const empty: EquippedItems = {
    weapon: null, head: null, body: null, hands: null, feet: null,
    ring_1: null, ring_2: null, consumable_1: null, consumable_2: null, consumable_3: null,
  };
  const ring = (id: string) => makeItem({ entity_id: id, item_type: 'ring' });
  const potion = (id: string) => makeItem({ entity_id: id, healing_amount: 20 });

  it('should put a ring on ring 1, then ring 2, then over ring 1 when both are worn (FS-4R9M9 R42)', () => {
    expect(equipSlotFor(ring('a'), empty)).toBe('ring_1');
    expect(equipSlotFor(ring('b'), { ...empty, ring_1: ring('a') })).toBe('ring_2');
    expect(equipSlotFor(ring('b'), { ...empty, ring_2: ring('a') })).toBe('ring_1');
    expect(equipSlotFor(ring('c'), { ...empty, ring_1: ring('a'), ring_2: ring('b') })).toBe('ring_1');
  });

  it('should put a consumable in the first empty slot, and nowhere when all are full', () => {
    expect(equipSlotFor(potion('p'), { ...empty, consumable_1: potion('q') })).toBe('consumable_2');
    expect(
      equipSlotFor(potion('p'), {
        ...empty, consumable_1: potion('q'), consumable_2: potion('r'), consumable_3: potion('s'),
      }),
    ).toBeNull();
  });

  it('should put a weapon or armour piece in its one slot, worn or not', () => {
    expect(equipSlotFor(makeItem({ weapon_type: 'sword' }), { ...empty, weapon: makeItem() })).toBe('weapon');
    expect(equipSlotFor(makeItem({ armor_slot: 'legs' }), empty)).toBe('feet');
  });

  it('should put an item of an unknown type nowhere', () => {
    expect(equipSlotFor(makeItem({ item_type: 'trinket' }), empty)).toBeNull();
  });
});

describe('getSlotDisplayName', () => {
  const cases: [EquipmentSlot, string][] = [
    ['weapon', 'Weapon'],
    ['head', 'Head'],
    ['body', 'Body'],
    ['hands', 'Hands'],
    ['feet', 'Feet'],
    ['ring_1', 'Ring 1'],
    ['ring_2', 'Ring 2'],
    ['consumable_1', 'Consumable 1'],
    ['consumable_2', 'Consumable 2'],
    ['consumable_3', 'Consumable 3'],
  ];

  cases.forEach(([slot, expected]) => {
    it(`should return "${expected}" for slot "${slot}"`, () => {
      expect(getSlotDisplayName(slot)).toBe(expected);
    });
  });
});

describe('isGameState (FS-F6F88 §State broadcast 26–27)', () => {
  const base = {
    session_id: 'session-1',
    current_player: null,
    other_players: [],
    items: [],
    doors: [],
    walls: [],
    containers: [],
    escape_doors: [],
    switches: [],
    escaped_count: 0,
  };

  it('should accept a run state carrying floor and stairs', () => {
    const run: ClientGameState = {
      ...base,
      world_type: 'run',
      floor: 2,
      stairs: [{ entity_id: 'stairs-1', position: { x: 120, y: 340 } }],
    };
    expect(isGameState(run)).toBe(true);
    expect(run.stairs?.[0].entity_id).toBe('stairs-1');
  });

  it('should accept a top-floor run state with no stairs', () => {
    const top: ClientGameState = { ...base, world_type: 'run', floor: 3, stairs: [] };
    expect(isGameState(top)).toBe(true);
  });

  it('should accept a hub state without floor or stairs', () => {
    const hub: ClientGameState = { ...base, world_type: 'hub' };
    expect(isGameState(hub)).toBe(true);
    expect(hub.floor).toBeUndefined();
    expect(hub.stairs).toBeUndefined();
  });
});

describe('a sealed floor on the wire (FS-5FZ4J §I R46)', () => {
  const base = {
    session_id: 'session-1',
    current_player: null,
    other_players: [],
    items: [],
    doors: [],
    containers: [],
    escape_doors: [],
    switches: [],
    escaped_count: 0,
  };

  it('should keep seal, seal_pieces and barriers as the server sends them', () => {
    const wire = JSON.parse(
      JSON.stringify({
        ...base,
        world_type: 'run',
        floor: 3,
        seal: { kind: 'lever_order', stage: 1, stages: 2, broken: false, key_carried: true },
        seal_pieces: [
          { entity_id: 'lever-1', kind: 'lever', position: { x: 120, y: 200 }, cell: { x: 1, y: 2 }, glyph: 'crow', active: false },
        ],
        barriers: [{ entity_id: 'gate-1', kind: 'gate', cells: [{ x: 4, y: 7 }, { x: 5, y: 7 }], open: false }],
      }),
    );
    expect(isGameState(wire)).toBe(true);
    const state = wire as ClientGameState;
    expect(state.seal).toEqual({ kind: 'lever_order', stage: 1, stages: 2, broken: false, key_carried: true });
    expect(state.seal_pieces?.[0]).toMatchObject({ kind: 'lever', glyph: 'crow', cell: { x: 1, y: 2 }, active: false });
    expect(state.barriers?.[0].cells).toEqual([{ x: 4, y: 7 }, { x: 5, y: 7 }]);
  });

  it.each(['lever', 'plate', 'block', 'brazier', 'stair_key', 'bridge_lever', 'mural', 'shrine'])(
    'should know the piece kind %s',
    (kind) => expect(knownSealPiece(kind)).toBe(kind),
  );

  it.each(['gate', 'secret_door', 'pit'])('should know the barrier kind %s', (kind) => expect(knownBarrier(kind)).toBe(kind));

  it.each(['statue', '', 'Lever'])('should read an unknown piece or barrier kind %j as none, drawing nothing', (kind) => {
    expect(knownSealPiece(kind)).toBeNull();
    expect(knownBarrier(kind)).toBeNull();
  });
});

describe('traps, poison and a search on the wire (FS-5FZ4J §I R46, R47, R49)', () => {
  const base = {
    session_id: 'session-1',
    other_players: [],
    items: [],
    doors: [],
    containers: [],
    escape_doors: [],
    switches: [],
    escaped_count: 0,
    world_type: 'run',
    floor: 4,
  };
  const me = { id: 'p1', entity_id: 'e1', username: 'Wenna', class: 'warrior', position: { x: 1, y: 2 }, direction: { x: 0, y: 1 }, escape: false };

  it('should keep traps with their puffs, a secret door, poisoned_for and the timed interact\'s target_kind as the server sends them', () => {
    const wire = JSON.parse(
      JSON.stringify({
        ...base,
        current_player: { ...me, poisoned_for: 4.5, timed_open: { entity_id: 'door-1', target_kind: 'search', elapsed: 0.5, duration: 2 } },
        other_players: [{ ...me, id: 'p2', entity_id: 'e2', poisoned_for: 1.25 }],
        traps: [
          { entity_id: 'trap-1', kind: 'spike_plate', cell: { x: 3, y: 4 }, armed: true, revealed: false },
          { entity_id: 'trap-2', kind: 'gas_vent', cell: { x: 6, y: 1 }, armed: true, revealed: false, puffed_at: 12.5 },
        ],
        barriers: [{ entity_id: 'door-1', kind: 'secret_door', cells: [{ x: 9, y: 2 }], open: false }],
      }),
    );
    expect(isGameState(wire)).toBe(true);
    const state = wire as ClientGameState;
    expect(state.traps).toEqual([
      { entity_id: 'trap-1', kind: 'spike_plate', cell: { x: 3, y: 4 }, armed: true, revealed: false },
      { entity_id: 'trap-2', kind: 'gas_vent', cell: { x: 6, y: 1 }, armed: true, revealed: false, puffed_at: 12.5 },
    ]);
    expect(state.barriers?.[0]).toMatchObject({ kind: 'secret_door', open: false });
    expect(state.current_player?.poisoned_for).toBe(4.5);
    expect(state.other_players[0].poisoned_for).toBe(1.25);
    expect(state.current_player?.timed_open?.target_kind).toBe('search');
  });

  it.each(['spike_plate', 'dart_wall', 'fire_jet', 'tripwire', 'gas_vent'])('should know the trap kind %s', (kind) =>
    expect(knownTrap(kind)).toBe(kind),
  );

  it.each(['bear_trap', '', 'Gas_Vent'])('should read an unknown trap kind %j as none, drawing nothing', (kind) =>
    expect(knownTrap(kind)).toBeNull(),
  );

  // FS-5FZ4J §I R46–R47 (I-5FZ4J-11): the respites and the Blessing, as game-service's types.FountainState,
  // HallowedAltarState and PublicPlayerState.Blessed send them
  it('should keep the fountain, the hallowed altar and blessed as the server sends them', () => {
    const wire = JSON.parse(
      JSON.stringify({
        ...base,
        current_player: { ...me, blessed: true, timed_open: { entity_id: 'altar-1', target_kind: 'pray', elapsed: 0.5, duration: 2 } },
        other_players: [{ ...me, id: 'p2', entity_id: 'e2', blessed: true }],
        fountain: { entity_id: 'fountain-1', position: { x: 400, y: 560 }, dry: false },
        hallowed_altar: { entity_id: 'altar-1', position: { x: 880, y: 240 }, prayed: false },
      }),
    );
    expect(isGameState(wire)).toBe(true);
    const state = wire as ClientGameState;
    expect(state.fountain).toEqual({ entity_id: 'fountain-1', position: { x: 400, y: 560 }, dry: false });
    expect(state.hallowed_altar).toEqual({ entity_id: 'altar-1', position: { x: 880, y: 240 }, prayed: false });
    expect(state.current_player?.blessed).toBe(true);
    expect(state.other_players[0].blessed).toBe(true);
    expect(state.current_player?.timed_open?.target_kind).toBe('pray');
  });

  // FS-9JV5K §A R4 (I-9JV5K-5): the wandering merchant, as game-service's types.MerchantState sends him
  it('should keep the merchant and every ware, the tome without an item, as the server sends them', () => {
    const merchant = {
      entity_id: 'merchant-1',
      position: { x: 900, y: 420 },
      wares: [
        { ware: 'health_potion', price: 60, left: 3, item: { name: 'Lesser Heal Potion', item_type: 'consumable', rarity: 'normal', healing_amount: 30 } },
        { ware: 'antidote', price: 40, left: 0, item: { name: 'Antidote', item_type: 'consumable' } },
        { ware: 'tome_of_filth', price: 1500, left: 1 },
      ],
    };
    const wire = JSON.parse(JSON.stringify({ ...base, merchant }));
    expect(isGameState(wire)).toBe(true);
    expect((wire as ClientGameState).merchant).toEqual(merchant);
  });
});

// FS-4EC7Z §F R22–R25, R28 (I-4EC7Z-6): the encounters, as game-service's types.EncounterNPCState, CageState,
// EncounterKeyState, ContractState, PublicPlayerState.ContractSettled, BarrierState.Revealed and MonsterState.Look send them
describe('dungeon encounters on the wire (FS-4EC7Z §F)', () => {
  const base = {
    session_id: 'session-1',
    other_players: [],
    items: [],
    doors: [],
    containers: [],
    escape_doors: [],
    switches: [],
    escaped_count: 0,
    world_type: 'run',
    floor: 3,
  };
  const me = { id: 'p1', entity_id: 'e1', username: 'Wenna', class: 'mercenary', position: { x: 1, y: 2 }, direction: { x: 0, y: 1 }, escape: false };

  it('should keep encounter_npcs, cages, encounter_keys, cage_key_carried, contract and contract_settled as the server sends them', () => {
    const npcs = [
      { entity_id: 'npc-1', kind: 'pilgrim', look: 'pilgrim_b', position: { x: 300, y: 400 }, facing: { x: 0, y: 1 }, health: 40, max_health: 60, stance: 'peaceful', action: 'cower', line: 'pilgrim_plea', line_at: 12.5 },
      { entity_id: 'npc-2', kind: 'cutthroat', look: 'cutthroat_a', position: { x: 320, y: 410 }, facing: { x: 1, y: 0 }, health: 90, max_health: 90, stance: 'ally', action: 'move', hirer_id: 'p1' },
    ];
    const wire = JSON.parse(
      JSON.stringify({
        ...base,
        current_player: { ...me, contract_settled: true, contract: { state: 'active', heading: 'north-east' } },
        other_players: [{ ...me, id: 'p2', entity_id: 'e2', contract_settled: true }],
        encounter_npcs: npcs,
        cages: [{ entity_id: 'cage-1', position: { x: 500, y: 520 }, open: false }],
        encounter_keys: [{ entity_id: 'key-1', position: { x: 900, y: 140 } }],
        cage_key_carried: true,
        barriers: [{ entity_id: 'door-1', kind: 'secret_door', cells: [{ x: 9, y: 2 }], open: false, revealed: true }],
        monsters: [
          { entity_id: 'm-1', archetype: 'contract_mark', look: 'debtor_knight', name: 'Ser Aldous the Indebted', level: 9, elite: false, boss: true, position: { x: 1, y: 1 }, facing: { x: 0, y: 1 }, action: 'idle', current_health: 900, max_health: 900 },
        ],
      }),
    );
    expect(isGameState(wire)).toBe(true);
    const state = wire as ClientGameState;
    expect(state.encounter_npcs).toEqual(npcs);
    expect(state.cages).toEqual([{ entity_id: 'cage-1', position: { x: 500, y: 520 }, open: false }]);
    expect(state.encounter_keys).toEqual([{ entity_id: 'key-1', position: { x: 900, y: 140 } }]);
    expect(state.cage_key_carried).toBe(true);
    expect(state.current_player?.contract).toEqual({ state: 'active', heading: 'north-east' });
    expect(state.current_player?.contract_settled).toBe(true);
    expect(state.other_players[0].contract_settled).toBe(true);
    expect(state.barriers?.[0].revealed).toBe(true);
    expect(state.monsters?.[0]).toMatchObject({ archetype: 'contract_mark', look: 'debtor_knight', boss: true });
  });
});

describe('placedKind (FS-1D6BX R12, D2)', () => {
  it.each([
    ['chest', 'chest'],
    ['sack', 'sack'],
    ['drop_pile', 'drop_pile'],
  ] as const)('should keep the known kind %s', (kind, want) => {
    expect(placedKind({ kind })).toBe(want);
  });

  it.each(['coffin', '', 'Chest'])('should handle an unknown kind %j as a chest', (kind) => {
    expect(placedKind({ kind })).toBe('chest');
  });
});

// FS-JS7C8 §E R47: every client derives every figure's facing from the motion it draws, so a
// player entry carries none (checked by tsc: the directive fails once the field exists)
describe('PublicPlayerState (FS-JS7C8 §E R47)', () => {
  it('should carry no facing', () => {
    // @ts-expect-error: a player entry has no facing field
    const facing: PublicPlayerState['facing'] = undefined;
    expect(facing).toBeUndefined();
  });
});
