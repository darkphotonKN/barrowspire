import { create } from "zustand";
import { ClassKey } from "@/data/classLore";

export interface CharacterSave {
  id: string;
  name: string;
  className: ClassKey;
  level: number;
  createdAt: number;
}

const STORAGE_KEY = "barrowspire_character_slots";
const ACTIVE_SLOT_KEY = "barrowspire_active_slot";

function loadInitialSlots(): (CharacterSave | null)[] {
  if (typeof window === "undefined") return [null, null, null];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [null, null, null];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed;
    }
  } catch (e) {
    console.error("Failed to load character slots", e);
  }
  return [null, null, null];
}

function loadInitialActiveSlot(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(ACTIVE_SLOT_KEY);
    if (raw !== null) {
      const idx = parseInt(raw, 10);
      if (!isNaN(idx) && idx >= 0) return idx;
    }
  } catch (e) {
    console.error("Failed to load active slot", e);
  }
  return 0;
}

function saveSlotsToStorage(slots: (CharacterSave | null)[], activeIndex: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
    localStorage.setItem(ACTIVE_SLOT_KEY, activeIndex.toString());
  } catch (e) {
    console.error("Failed to save character slots", e);
  }
}

interface GameState {
  sessionId: string | null;
  selectedClass: ClassKey;
  selectedCharacterName: string;
  activeSlotIndex: number;
  slots: (CharacterSave | null)[];
  
  setSessionId: (id: string | null) => void;
  setSelectedClass: (cls: ClassKey) => void;
  setSelectedCharacterName: (name: string) => void;
  setActiveSlotIndex: (index: number) => void;
  createCharacter: (slotIndex: number, name: string, className: ClassKey) => CharacterSave;
  deleteCharacter: (slotIndex: number) => void;
  getActiveCharacter: () => CharacterSave | null;
}

export const useGameStore = create<GameState>()((set, get) => {
  const initialSlots = loadInitialSlots();
  const initialActive = loadInitialActiveSlot();
  const activeChar = initialSlots[initialActive] || initialSlots[0];

  return {
    sessionId: null,
    selectedClass: activeChar ? activeChar.className : "warrior",
    selectedCharacterName: activeChar ? activeChar.name : "Kaelen",
    activeSlotIndex: initialActive < initialSlots.length ? initialActive : 0,
    slots: initialSlots,

    setSessionId: (id) => set({ sessionId: id }),
    setSelectedClass: (cls) => set({ selectedClass: cls }),
    setSelectedCharacterName: (name) => set({ selectedCharacterName: name }),

    setActiveSlotIndex: (index: number) => {
      const state = get();
      if (index < 0 || index >= state.slots.length) return;
      const targetChar = state.slots[index];
      saveSlotsToStorage(state.slots, index);
      set({
        activeSlotIndex: index,
        selectedClass: targetChar ? targetChar.className : state.selectedClass,
        selectedCharacterName: targetChar ? targetChar.name : state.selectedCharacterName,
      });
    },

    createCharacter: (slotIndex: number, name: string, className: ClassKey) => {
      const state = get();
      const newChar: CharacterSave = {
        id: "char_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 6),
        name: name.trim() || "Hero",
        className,
        level: 1,
        createdAt: Date.now(),
      };

      const updatedSlots = [...state.slots];
      while (updatedSlots.length <= slotIndex) {
        updatedSlots.push(null);
      }
      updatedSlots[slotIndex] = newChar;

      saveSlotsToStorage(updatedSlots, slotIndex);

      set({
        slots: updatedSlots,
        activeSlotIndex: slotIndex,
        selectedClass: className,
        selectedCharacterName: newChar.name,
      });

      return newChar;
    },

    deleteCharacter: (slotIndex: number) => {
      const state = get();
      let updatedSlots = [...state.slots];
      updatedSlots[slotIndex] = null;

      // Trim trailing empty slots beyond index 2
      while (updatedSlots.length > 3 && updatedSlots[updatedSlots.length - 1] === null) {
        updatedSlots.pop();
      }

      let nextActive = state.activeSlotIndex;
      if (slotIndex === state.activeSlotIndex || nextActive >= updatedSlots.length) {
        nextActive = updatedSlots.findIndex((s) => s !== null);
        if (nextActive === -1) nextActive = 0;
      }

      const activeChar = updatedSlots[nextActive];

      saveSlotsToStorage(updatedSlots, nextActive);

      set({
        slots: updatedSlots,
        activeSlotIndex: nextActive,
        selectedClass: activeChar ? activeChar.className : "warrior",
        selectedCharacterName: activeChar ? activeChar.name : "Hero",
      });
    },

    getActiveCharacter: () => {
      const state = get();
      return state.slots[state.activeSlotIndex] || null;
    },
  };
});
