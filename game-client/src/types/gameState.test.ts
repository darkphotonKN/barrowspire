import { describe, it, expect } from 'vitest';
import {
  getItemType,
  getValidSlotsForItem,
  equipSlotFor,
  EquippedItems,
  getSlotDisplayName,
  isGameState,
  ClientGameState,
  ItemState,
  EquipmentSlot,
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

  it('should accept a run state carrying floor, floor_count and stairs', () => {
    const run: ClientGameState = {
      ...base,
      world_type: 'run',
      floor: 2,
      floor_count: 3,
      stairs: [{ entity_id: 'stairs-1', position: { x: 120, y: 340 } }],
    };
    expect(isGameState(run)).toBe(true);
    expect(run.stairs?.[0].entity_id).toBe('stairs-1');
  });

  it('should accept a top-floor run state with no stairs', () => {
    const top: ClientGameState = { ...base, world_type: 'run', floor: 3, floor_count: 3, stairs: [] };
    expect(isGameState(top)).toBe(true);
  });

  it('should accept a hub state without floor, floor_count or stairs', () => {
    const hub: ClientGameState = { ...base, world_type: 'hub' };
    expect(isGameState(hub)).toBe(true);
    expect(hub.floor).toBeUndefined();
    expect(hub.stairs).toBeUndefined();
  });
});
