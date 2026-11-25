import { describe, expect, it } from "vitest";
import { instanceItem, type ItemInstance } from "@/items/loadoutItem";
import type { ItemState } from "@/types/gameState";
import {
  ITEM_SNAPSHOT_BYTES_MAX,
  isUnseen,
  itemSnapshot,
  readItemSnapshot,
  wireBytes,
} from "./itemLinks";

// FS-KBA4Q §Requirements B (R13, R17), § The item snapshot. I-KBA4Q-5: the snapshot a link press
// takes from the overlay's item, built so the pod's check (R27) passes for every real item.

const sword: ItemState = {
  item_id: "11111111-1111-1111-1111-111111111111",
  entity_id: "22222222-2222-2222-2222-222222222222",
  name: "Rusty Blade",
  quantity: 1,
  item_type: "weapon",
  rarity: "rare",
  weapon_type: "sword",
  attack_power: 12,
  critical_rate: 0.05,
  item_level: 7,
  required_level: 3,
  affixes: [{ stat: "strength", tier: 2, value: 4 }],
  description: "A blade left out in the rain.",
  durability: 40,
  status: "AVAILABLE",
  unsafe: true,
  lootedAt: 123,
};

/** The keys the pod reads; any other refuses the whole line (R27). */
const ALLOWED = [
  "name",
  "item_type",
  "rarity",
  "weapon_type",
  "armor_slot",
  "attack_power",
  "defense_rating",
  "magic_resistance",
  "healing_amount",
  "mana_amount",
  "critical_rate",
  "item_level",
  "required_level",
  "affixes",
  "unique_effect",
  "description",
];

describe("itemSnapshot (R17: what a link carries)", () => {
  it("should carry the item's own fields and nothing that says whose it is or where it stands", () => {
    const snapshot = itemSnapshot(sword);

    expect(snapshot).toEqual({
      name: "Rusty Blade",
      item_type: "weapon",
      rarity: "rare",
      weapon_type: "sword",
      attack_power: 12,
      critical_rate: 0.05,
      item_level: 7,
      required_level: 3,
      affixes: [{ stat: "strength", tier: 2, value: 4 }],
      description: "A blade left out in the rain.",
    });
    for (const key of ["item_id", "entity_id", "status", "unsafe", "quantity", "durability", "lootedAt"])
      expect(snapshot).not.toHaveProperty(key);
  });

  it("should carry only keys the pod reads, whatever the source item held", () => {
    const loaded = { ...sword, icon_url: "/icons/x.png", template_id: "t", buff_duration: 3 } as ItemState;

    const snapshot = itemSnapshot(loaded);

    expect(Object.keys(snapshot ?? {}).every((key) => ALLOWED.includes(key))).toBe(true);
  });

  it("should not share the item's affixes, so a later change to the item changes no snapshot", () => {
    const item: ItemState = { ...sword, affixes: [{ stat: "agility", tier: 1, value: 2 }] };
    const snapshot = itemSnapshot(item);

    item.affixes![0].value = 99;

    expect(snapshot?.affixes).toEqual([{ stat: "agility", tier: 1, value: 2 }]);
  });

  it("should give a bare item a snapshot of its name and type alone, the type read from its stats where it names none", () => {
    expect(itemSnapshot({ item_id: "a", entity_id: "b", name: "Plain Band", quantity: 1 })).toEqual({
      name: "Plain Band",
      item_type: "ring",
    });
    expect(
      itemSnapshot({ item_id: "a", entity_id: "b", name: "Red Draught", quantity: 3, healing_amount: 20 }),
    ).toEqual({ name: "Red Draught", item_type: "consumable", healing_amount: 20 });
  });

  it("should leave out every optional field the pod would refuse, never sending it empty, null or out of range", () => {
    const odd = {
      ...sword,
      rarity: "mythic",
      weapon_type: "great sword!",
      armor_slot: "",
      attack_power: 12.5,
      defense_rating: -1,
      magic_resistance: Number.NaN,
      healing_amount: 1_000_000,
      mana_amount: null,
      critical_rate: 1.2,
      item_level: 0,
      required_level: "3",
      affixes: [],
      unique_effect: "   ",
      description: "",
    } as unknown as ItemState;

    expect(itemSnapshot(odd)).toEqual({ name: "Rusty Blade", item_type: "weapon" });
  });

  it("should keep a zero where zero is in range", () => {
    const snapshot = itemSnapshot({ ...sword, attack_power: 0, critical_rate: 0 });

    expect(snapshot?.attack_power).toBe(0);
    expect(snapshot?.critical_rate).toBe(0);
  });

  it("should keep the affixes the pod knows, exactly {stat, tier, value}, six at most", () => {
    const affix = (stat: string, tier = 1, value = 5) => ({ stat, tier, value, rolled: true });
    const item = {
      ...sword,
      affixes: [
        affix("strength"),
        affix("vitality"),
        affix("agility", 10),
        affix("max_mana", 1, 2.5),
        affix("intelligence"),
        affix("max_health"),
        affix("attack_speed"),
        affix("move_speed"),
        affix("crit_chance", 0),
        affix("flat_damage"),
        affix("defense"),
      ],
    } as unknown as ItemState;

    expect(itemSnapshot(item)?.affixes).toEqual([
      { stat: "strength", tier: 1, value: 5 },
      { stat: "intelligence", tier: 1, value: 5 },
      { stat: "max_health", tier: 1, value: 5 },
      { stat: "attack_speed", tier: 1, value: 5 },
      { stat: "move_speed", tier: 1, value: 5 },
      { stat: "crit_chance", tier: 0, value: 5 },
    ]);
  });

  it("should turn multi-line lore into one line: each run of line breaks, tabs and other control characters one space, the ends trimmed", () => {
    const snapshot = itemSnapshot({
      ...sword,
      description: "\n  Forged in the barrow.\r\n\r\n\tIt hums\u0000\u0085at night.\u007f\n",
      unique_effect: "On a kill:\n\theal 5.",
    });

    expect(snapshot?.description).toBe("Forged in the barrow. It hums at night.");
    expect(snapshot?.unique_effect).toBe("On a kill: heal 5.");
  });

  it("should cut over-long words to the pod's limits, counted in code points", () => {
    const snapshot = itemSnapshot({
      ...sword,
      description: "龍".repeat(299) + "🗡️".repeat(5),
      unique_effect: "e".repeat(199) + " tail",
    });

    expect(Array.from(snapshot?.description ?? "")).toHaveLength(300);
    expect(snapshot?.description?.startsWith("龍".repeat(299))).toBe(true);
    // cut at 200, and the space the cut ended on trimmed
    expect(snapshot?.unique_effect).toBe("e".repeat(199));
  });

  it("should keep three of the heaviest items within the pod's 4096 bytes, by cutting the lore", () => {
    const heavy: ItemState = {
      ...sword,
      name: "<".repeat(100),
      rarity: "uncommon",
      weapon_type: "z".repeat(32),
      armor_slot: "gloves",
      attack_power: 999999,
      defense_rating: 999999,
      magic_resistance: 999999,
      healing_amount: 999999,
      mana_amount: 999999,
      critical_rate: 0.123456789012345,
      item_level: 999,
      required_level: 999,
      affixes: Array.from({ length: 6 }, () => ({ stat: "magic_resistance", tier: 9, value: 999999 })),
      unique_effect: "&".repeat(200),
      description: "🗡".repeat(300),
    };

    const snapshot = itemSnapshot(heavy);

    expect(snapshot).not.toBeNull();
    expect(wireBytes(snapshot)).toBeLessThanOrEqual(ITEM_SNAPSHOT_BYTES_MAX);
    expect(wireBytes([snapshot, snapshot, snapshot])).toBeLessThanOrEqual(4096);
    expect(snapshot?.name).toBe("<".repeat(100));
    expect(snapshot?.affixes).toHaveLength(6);
  });

  it("should count bytes as the pod encodes them: <, > and & six bytes each", () => {
    expect(wireBytes("a")).toBe(3);
    expect(wireBytes("<>&")).toBe(20);
    expect(wireBytes("龍")).toBe(5);
    expect(wireBytes("\u2028")).toBe(8);
  });

  it("should be read back whole by the reader of a received line", () => {
    const snapshot = itemSnapshot(sword);

    expect(readItemSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });
});

describe("itemSnapshot (R13: a name the token cannot carry)", () => {
  const named = (name: string): ItemState => ({ ...sword, name });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["an opening bracket", "Blade [old]"],
    ["a closing bracket", "Blade]"],
    ["a line break", "Rusty\nBlade"],
    ["a tab", "Rusty\tBlade"],
    ["a zero-width space (Cf)", "Rusty\u200bBlade"],
    ["a right-to-left override (Cf)", "Rusty \u202eedalB"],
    ["a soft hyphen (Cf)", "Rus\u00adty Blade"],
    ["a line separator (Zl)", "Rusty\u2028Blade"],
    ["a paragraph separator (Zp)", "Rusty\u2029Blade"],
    ["over 100 code points", "n".repeat(101)],
  ])("should give no snapshot for a name that is %s", (_what, name) => {
    expect(itemSnapshot(named(name))).toBeNull();
  });

  it("should trim the name, and take one of exactly 100 code points", () => {
    expect(itemSnapshot(named("  Rusty Blade "))?.name).toBe("Rusty Blade");
    expect(itemSnapshot(named("龍".repeat(100)))?.name).toBe("龍".repeat(100));
  });

  it("should give no snapshot for an item whose type is none of the four", () => {
    expect(itemSnapshot({ ...sword, item_type: "relic" })).toBeNull();
  });
});

// The hub's items come off the REST read (`instanceItem`), not the world state: the rarity is the
// rarity list's display name, and the instance carries much the snapshot must not.
describe("itemSnapshot (the hub's item shape)", () => {
  const RARITY_NAMES = new Map([
    ["r-normal", "Normal"],
    ["r-uncommon", "Uncommon"],
    ["r-rare", "Rare"],
    ["r-runed", "Runed"],
    ["r-fabled", "Fabled"],
  ]);
  const instance = (fields: Partial<ItemInstance>): ItemInstance => ({
    id: "22222222-2222-2222-2222-222222222222",
    template_id: "11111111-1111-1111-1111-111111111111",
    owner_member_id: "m-1",
    character_id: "c-1",
    location: "bag",
    status: "AVAILABLE",
    source: "loot",
    item_level: 0,
    affixes: [],
    ...fields,
  });
  const hubItem = (fields: Partial<ItemInstance>): ItemState =>
    instanceItem(instance(fields), RARITY_NAMES);

  it.each([
    ["r-normal", "normal"],
    ["r-uncommon", "uncommon"],
    ["r-rare", "rare"],
    ["r-runed", "runed"],
    ["r-fabled", "fabled"],
  ])("should carry the rarity %s names as the code %s", (rarityId, code) => {
    expect(itemSnapshot(hubItem({ name: "Band", item_type: "ring", rarity_id: rarityId }))?.rarity).toBe(code);
  });

  it("should carry a rarity written with spaces or capitals as its code, and leave out one that is no tier", () => {
    expect(itemSnapshot({ ...sword, rarity: "  RUNED " })?.rarity).toBe("runed");
    expect(itemSnapshot({ ...sword, rarity: "Mythic" })).not.toHaveProperty("rarity");
  });

  it("should carry a hub weapon whole: type, kind, stats, levels, affixes and lore", () => {
    const snapshot = itemSnapshot(
      hubItem({
        name: "Barrow Crossbow",
        item_type: "weapon",
        rarity_id: "r-rare",
        weapon_type: "Crossbow",
        attack_power: 14,
        critical_rate: 0.07999999821186066,
        item_level: 12,
        required_level: 9,
        affixes: [
          { stat: "agility", tier: 2, value: 6 },
          { stat: "crit_chance", tier: 1, value: 3 },
        ],
        description: "Strung with barrow-gut.",
        buy_price: 40,
        sell_price: 10,
        buff_duration: 0,
      }),
    );

    expect(snapshot).toEqual({
      name: "Barrow Crossbow",
      item_type: "weapon",
      rarity: "rare",
      weapon_type: "crossbow",
      attack_power: 14,
      critical_rate: 0.07999999821186066,
      item_level: 12,
      required_level: 9,
      affixes: [
        { stat: "agility", tier: 2, value: 6 },
        { stat: "crit_chance", tier: 1, value: 3 },
      ],
      description: "Strung with barrow-gut.",
    });
  });

  it.each([
    ["head", "head"],
    ["chest", "chest"],
    ["legs", "legs"],
    ["gloves", "gloves"],
    ["Chest", "chest"],
    // the client's own slot names, should a source ever carry one
    ["body", "chest"],
    ["hands", "gloves"],
    ["feet", "legs"],
  ])("should carry hub armour in slot %s as the slot code %s", (slot, code) => {
    const snapshot = itemSnapshot(
      hubItem({
        name: "Grave Plate",
        item_type: "armor",
        rarity_id: "r-normal",
        armor_slot: slot,
        defense_rating: 6,
        magic_resistance: 2,
      }),
    );

    expect(snapshot).toEqual({
      name: "Grave Plate",
      item_type: "armor",
      rarity: "normal",
      armor_slot: code,
      defense_rating: 6,
      magic_resistance: 2,
    });
  });

  it("should carry a hub unique ring: fixed affixes of tier 0 and its effect", () => {
    const snapshot = itemSnapshot(
      hubItem({
        name: "Lich's Signet",
        item_type: "ring",
        rarity_id: "r-fabled",
        item_level: 30,
        required_level: 25,
        affixes: [{ stat: "max_mana", tier: 0, value: 40 }],
        unique_effect: "Your spells cost blood, not mana.",
      }),
    );

    expect(snapshot).toEqual({
      name: "Lich's Signet",
      item_type: "ring",
      rarity: "fabled",
      item_level: 30,
      required_level: 25,
      affixes: [{ stat: "max_mana", tier: 0, value: 40 }],
      unique_effect: "Your spells cost blood, not mana.",
    });
  });

  it("should carry a hub draught, and a type the source writes in capitals", () => {
    expect(
      itemSnapshot(hubItem({ name: "Red Draught", item_type: "Consumable", healing_amount: 20, mana_amount: 5 })),
    ).toEqual({ name: "Red Draught", item_type: "consumable", healing_amount: 20, mana_amount: 5 });
  });

  it("should give a legacy hub instance (no rarity, level 0) its name and type alone", () => {
    expect(itemSnapshot(hubItem({ name: "Old Knife", item_type: "weapon" }))).toEqual({
      name: "Old Knife",
      item_type: "weapon",
    });
  });
});

describe("itemSnapshot (invisible and format characters, as the pod refuses them)", () => {
  it("should take format characters out of the lore and the effect, and make line and paragraph separators a space", () => {
    const snapshot = itemSnapshot({
      ...sword,
      description: "\u200bForged\u200b in the\u2028barrow.\u2029\u202eIt hums\u202c at\u00ad night.\ufeff",
      unique_effect: "On a kill:\u2028\u200b\u2029heal\u200d 5.",
    });

    expect(snapshot?.description).toBe("Forged in the barrow. It hums at night.");
    expect(snapshot?.unique_effect).toBe("On a kill: heal 5.");
  });

  it("should leave out lore that is nothing but invisible characters", () => {
    const snapshot = itemSnapshot({ ...sword, description: "\u200b\u2028\u202e", unique_effect: "\u200d" });

    expect(snapshot).not.toHaveProperty("description");
    expect(snapshot).not.toHaveProperty("unique_effect");
  });

  it("should keep what is not one: a no-break space, a combining mark, a variation selector", () => {
    const description = "A\u00a0blade, e\u0301tched \u2694\ufe0f";

    expect(itemSnapshot({ ...sword, description })?.description).toBe(description);
  });

  it.each([
    ["Cc", "\u0000"], ["Cc", "\u001f"], ["Cc", "\u007f"], ["Cc", "\u009f"],
    ["Cf", "\u00ad"], ["Cf", "\u0600"], ["Cf", "\u061c"], ["Cf", "\u200b"], ["Cf", "\u200f"],
    ["Cf", "\u202a"], ["Cf", "\u202e"], ["Cf", "\u2060"], ["Cf", "\u2069"], ["Cf", "\ufeff"],
    ["Cf", "\u{e0001}"], ["Zl", "\u2028"], ["Zp", "\u2029"],
  ])("should count a %s character as unseen: %j", (_category, c) => {
    expect(isUnseen(c)).toBe(true);
    expect(itemSnapshot({ ...sword, name: `Rusty${c}Blade` })).toBeNull();
  });

  it.each([
    ["a space (Zs)", " "], ["a no-break space (Zs)", "\u00a0"], ["an ideographic space (Zs)", "\u3000"],
    ["a letter", "\u00e9"], ["the first past the C1 controls' neighbour", "\u00a1"], ["a combining mark (Mn)", "\u0301"],
    ["a variation selector (Mn)", "\ufe0f"], ["a private-use character (Co)", "\ue000"], ["an emoji", "\u{1f5e1}"],
  ])("should not count %s as unseen", (_what, c) => {
    expect(isUnseen(c)).toBe(false);
    expect(itemSnapshot({ ...sword, name: `Rusty${c}Blade` })?.name).toBe(`Rusty${c}Blade`);
  });
});
