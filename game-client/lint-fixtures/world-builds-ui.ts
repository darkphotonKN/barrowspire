// FIXTURE — must be REJECTED as a world scene would be (FS-TQZ5J): a world building the UI scene's
// chat window and its own interface player. Not compiled, not imported.
import { ChatWindow } from "@/ui/ChatWindow";
import { UiSounds } from "@/audio/uiSounds";
export const bad = [ChatWindow, UiSounds];
