import { create } from "zustand";

interface GameState {
  sessionId: string | null;
  selectedClass: string;
  setSessionId: (id: string | null) => void;
  setSelectedClass: (cls: string) => void;
}

export const useGameStore = create<GameState>()((set) => ({
  sessionId: null,
  selectedClass: "warrior", // default class
  setSessionId: (id) => set({ sessionId: id }),
  setSelectedClass: (cls) => set({ selectedClass: cls }),
}));
