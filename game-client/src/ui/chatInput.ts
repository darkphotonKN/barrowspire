/**
 * The chat input's rules (FS-WJGFJ R26–R28), apart from any scene or DOM: when it may open, what
 * opening does to the scene's keyboard, what Enter and Esc do, and how long a line may be. The
 * text field is a thin DOM adapter (`chatInputField.ts`) that reports focus, keys and typing here.
 *
 * Exactly one thing owns Enter and Esc at a time (R27): the scene says through `mayOpen` whether
 * a dialogue, a menu or an overlay holds them; while the input is open the scene's keyboard is
 * off, so nothing else hears them.
 */

import type { UiEffect } from "@/audio/uiSounds";
import { CHAT_CHANNELS, type ChatChannel } from "@/stores/chatStore";

/**
 * Each channel's prefix, PoE style (FS-WJGFJ Amendment 2026-10-31): typed at the start of a line
 * it picks the channel, and picking the channel writes it. Area has none.
 */
export const CHAT_PREFIX: Readonly<Record<ChatChannel, string>> = {
  area: "",
  world: "#",
  trade: "$",
  party: "%",
  whisper: "@",
};

/**
 * The channels the server relays today; the picker shows the rest disabled. World opened with
 * FS-5SH4G (I-5SH4G-3), party with FS-XGW7H (I-XGW7H-2), whisper with FS-KCQ06 (I-KCQ06-3);
 * trade waits for its own scoping. Party is open whether or not the player is in a party
 * (FS-XGW7H C19): the server answers a send from a player in none with `no_party`.
 */
export const CHAT_OPEN_CHANNELS: ReadonlySet<ChatChannel> =
  new Set<ChatChannel>(["area", "world", "party", "whisper"]);

/**
 * The channels the window offers, as filter tabs and as picker rows. Trade is hidden until it has
 * its own scoping (Nick, 2026-11-03); it stays in CHAT_CHANNELS, the protocol's closed set, so a
 * trade line is still recognised. The server relays none, so none arrives.
 */
export const CHAT_SHOWN_CHANNELS: readonly ChatChannel[] = CHAT_CHANNELS.filter(
  (channel) => channel !== "trade",
);

/** The most code points a line may carry, as the server counts them (R5, R26). */
export const CHAT_TEXT_MAX = 200;

/** A line cut to `CHAT_TEXT_MAX` code points, so an emoji counts as the server counts it. */
export function clampChatText(text: string): string {
  const points = Array.from(text);
  return points.length <= CHAT_TEXT_MAX
    ? text
    : points.slice(0, CHAT_TEXT_MAX).join("");
}

/**
 * A draft cut to what may be sent: a whisper's message, after its `@Name` and the whitespace that
 * follows, to `CHAT_TEXT_MAX` code points, as the server counts the message alone (FS-KCQ06 R5);
 * any other draft, a whisper with no message yet among them, whole, its prefix included.
 */
function clampDraft(draft: string, channel: ChatChannel): string {
  const head = channel === "whisper" ? /^@\S+\s+/.exec(draft)?.[0] : undefined;
  return head
    ? head + clampChatText(draft.slice(head.length))
    : clampChatText(draft);
}

/** The text field and its channel picker, as the input drives them. */
export interface ChatInputField {
  value: string;
  /** The channel the picker shows. */
  channel: ChatChannel;
  focus(): void;
  blur(): void;
}

/** The part of a scene's keyboard plugin the input switches off while the player types. */
export interface SceneKeyboard {
  enabled: boolean;
  resetKeys(): void;
}

/**
 * What a sent line carries: the picked channel and the text without its prefix; a whisper also
 * names its target, the character name as typed (FS-KCQ06 R1, R11).
 */
export interface ChatSend {
  channel: ChatChannel;
  target?: string;
  text: string;
}

/** A whisper's body split into who it is for and what it says. */
export interface WhisperParts {
  target: string;
  text: string;
}

/**
 * The text after `@` split at its first whitespace: the name before it, the message after
 * (FS-KCQ06 R12). Character names hold no whitespace (Nick, 2026-11-03), so this is the whole
 * rule. Either part missing is no whisper.
 */
export function whisperOf(body: string): WhisperParts | null {
  const match = /^(\S+)\s+([\s\S]*\S)/.exec(body);
  if (!match) return null;
  return { target: match[1], text: match[2] };
}

export interface ChatInputDeps {
  field: ChatInputField;
  keyboard: () => SceneKeyboard | null | undefined;
  /** Whether nothing else owns Enter and Esc right now (R27). */
  mayOpen: () => boolean;
  /**
   * Whether what holds the keys now took them by a press elsewhere (the letter panel, opened from
   * its envelope): the input lets go as a press in the world does, the draft kept for later.
   * Anything else that takes the keys drops the draft (R27).
   */
  keepsDraft?: () => boolean;
  send: (line: ChatSend) => void;
  /** Told whenever the open state or the draft changes, so the window can redraw its hint. */
  changed?: () => void;
  /** The channels that may be picked; the server's open ones unless a test says otherwise. */
  open?: ReadonlySet<ChatChannel>;
  /** The lines this player sent, oldest first, and where a newly sent one is kept. */
  recall?: ChatRecall;
  /**
   * Plays an interface sound (FS-WDM0X § Pass 2: the chat): the picker's list opened or shut by the
   * player (C2, C3), a draft refused (C5). None, nothing plays.
   */
  play?: (effect: UiEffect) => void;
}

/** The sent lines the arrow keys walk through, as a terminal's history (asked 2026-10-31). */
export interface ChatRecall {
  lines(): readonly string[];
  remember(line: string): void;
}

/** The open channel whose prefix starts `text`, if any; Area otherwise. */
function channelOf(text: string, open: ReadonlySet<ChatChannel>): ChatChannel {
  for (const [channel, prefix] of Object.entries(CHAT_PREFIX) as [
    ChatChannel,
    string,
  ][]) {
    if (prefix && open.has(channel) && text.startsWith(prefix)) return channel;
  }
  return "area";
}

export class ChatInput {
  private open = false;
  /** The keyboard's state when the input opened, put back as it was when it closes. */
  private keyboardWasEnabled = true;

  /** Which sent line the arrows have recalled, or null while the player types their own. */
  private recalled: number | null = null;
  /** What the player had typed before the arrows took over, given back past the newest line. */
  private draft = "";
  private readonly pickable: ReadonlySet<ChatChannel>;
  /** The picker's list: whether it is open, and the row the pointer or the keys are on. */
  private listOpen = false;
  private highlight: ChatChannel = "area";

  constructor(private readonly deps: ChatInputDeps) {
    this.pickable = deps.open ?? CHAT_OPEN_CHANNELS;
  }

  /**
   * The picker chose a channel: its prefix replaces the draft's and the list shuts, if it is one
   * the server relays. A closed channel changes nothing, the list included (FS-J267Q R3).
   */
  pick(channel: ChatChannel): void {
    const field = this.deps.field;
    if (!this.pickable.has(channel)) {
      field.channel = channelOf(field.value, this.pickable);
      return;
    }
    const body = field.value.slice(
      CHAT_PREFIX[channelOf(field.value, this.pickable)].length,
    );
    field.value = CHAT_PREFIX[channel] + body;
    field.channel = channel;
    // a row picked from the open list shuts it, the pick's one sound (FS-WDM0X § Pass 2: the chat, C3)
    if (this.listOpen) this.deps.play?.("menu_dropdown_close");
    this.listOpen = false;
    this.deps.changed?.();
  }

  /** Whether `channel` may be picked: one the server relays (a closed one is drawn dim). */
  canPick(channel: ChatChannel): boolean {
    return this.pickable.has(channel);
  }

  /** Whether the picker's list is open (FS-J267Q R3). */
  pickerOpen(): boolean {
    return this.listOpen;
  }

  /** The list's highlighted row, or null while it is shut. */
  highlighted(): ChatChannel | null {
    return this.listOpen ? this.highlight : null;
  }

  /**
   * A press on the picker (FS-J267Q R4): it opens the input as a press on the bar does,
   * unless something else owns the keys, and opens the list on the current channel, or shuts it.
   */
  togglePicker(): void {
    if (!this.open && !this.requestOpen()) return;
    this.listOpen = !this.listOpen;
    this.highlight = this.deps.field.channel;
    this.deps.play?.(this.listOpen ? "menu_dropdown_open" : "menu_dropdown_close");
    this.deps.changed?.();
  }

  /** The pointer is over a row: an open channel takes the highlight, a closed one never does. */
  hover(channel: ChatChannel): void {
    if (!this.listOpen || !this.pickable.has(channel)) return;
    if (channel === this.highlight) return;
    this.highlight = channel;
    this.deps.changed?.();
  }

  /**
   * Shuts the list, the input left as it is: a press outside it, the view resized (FS-J267Q R4, R6).
   * `byPlayer` (a press outside it, Esc in it) plays `menu_dropdown_close`; the game's shuts, and the
   * field's keys shutting it as typing, play nothing (FS-WDM0X § Pass 2: the chat, C3).
   */
  closePicker(byPlayer = false): void {
    if (!this.listOpen) return;
    this.listOpen = false;
    if (byPlayer) this.deps.play?.("menu_dropdown_close");
    this.deps.changed?.();
  }

  /**
   * A name clicked in the window (FS-KCQ06 C15): the draft becomes `@Name ` and what it said,
   * its own prefix dropped (a whisper draft's whole `@Other `), and the input opens on it. Nothing
   * happens while something else owns the keys, or while whisper is not relayed.
   */
  whisperTo(name: string): void {
    if (!this.pickable.has("whisper") || !this.deps.mayOpen()) return;
    const field = this.deps.field;
    const channel = channelOf(field.value, this.pickable);
    const words =
      channel === "whisper"
        ? field.value.replace(/^@\S*\s*/, "")
        : field.value.slice(CHAT_PREFIX[channel].length).trimStart();
    this.recalled = null;
    field.value = clampDraft(
      `${CHAT_PREFIX.whisper}${name} ${words}`,
      "whisper",
    );
    field.channel = "whisper";
    this.deps.changed?.();
    this.requestOpen();
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Enter in the scene, or a click on the field: focuses the field if nothing else owns the keys. */
  requestOpen(): boolean {
    if (this.open || !this.deps.mayOpen()) return false;
    this.deps.field.focus();
    return true;
  }

  /** The field took focus, by Enter or by a click: the player is typing now (R26). */
  focused(): void {
    if (this.open) return;
    if (!this.deps.mayOpen()) {
      this.deps.field.blur();
      return;
    }
    this.open = true;
    const keyboard = this.deps.keyboard();
    if (keyboard) {
      this.keyboardWasEnabled = keyboard.enabled;
      // a key held as the input opened would otherwise stay down, and an Enter latched for a
      // menu would answer it the next time it opened
      keyboard.resetKeys();
      keyboard.enabled = false;
    }
    this.deps.changed?.();
  }

  /** The field lost focus: the input closes, the draft stays for the next open. */
  blurred(): void {
    if (!this.open) return;
    this.open = false;
    // the list lives only while the player types (FS-J267Q R6)
    this.listOpen = false;
    const keyboard = this.deps.keyboard();
    if (keyboard) keyboard.enabled = this.keyboardWasEnabled;
    this.deps.changed?.();
  }

  /**
   * A key in the open field. Enter sends what is typed and stays open for the next line; Enter on
   * nothing closes; Esc closes and throws the draft away (R26 as revised 2026-10-31). Tab picks
   * the next open channel, Shift+Tab (`shift`) the previous; while the picker's list is open the
   * arrows, Enter and Esc are the list's (FS-J267Q R5). While an input method is
   * composing, every key is its own (Enter picks a character) and nothing here answers.
   */
  keyDown(key: string, composing: boolean, shift = false): void {
    if (!this.open || composing) return;
    if (key === "Tab") {
      this.closePicker();
      this.cycle(shift ? -1 : 1);
      return;
    }
    if (this.listOpen && this.listKey(key)) return;
    if (key === "Enter") {
      const field = this.deps.field;
      const channel = channelOf(field.value, this.pickable);
      const body = field.value.slice(CHAT_PREFIX[channel].length).trim();
      if (!body) {
        // Enter on nothing is the way back to the game, as the second Enter after a line
        this.discardAndClose();
        return;
      }
      if (channel === "whisper") {
        // a name with no message is not sent; the draft stays to be finished (FS-KCQ06 R12)
        // read untrimmed: a space straight after the @ leaves no name
        const whisper = whisperOf(
          field.value.slice(CHAT_PREFIX.whisper.length),
        );
        // the one refusal of chat input (FS-WDM0X § Pass 2: the chat, C5)
        if (!whisper) return this.deps.play?.("menu_error");
        this.deps.send({
          channel,
          target: whisper.target,
          text: clampChatText(whisper.text),
        });
      } else {
        this.deps.send({ channel, text: clampChatText(body) });
      }
      this.deps.recall?.remember(field.value.trim());
      this.recalled = null;
      // the input stays open for the next line (revised by the user 2026-10-31); the channel and
      // its prefix stay ready
      field.value = CHAT_PREFIX[field.channel];
      this.deps.changed?.();
    } else if (key === "Escape") {
      this.discardAndClose();
    } else if (key === "ArrowUp") {
      this.recall(-1);
    } else if (key === "ArrowDown") {
      this.recall(1);
    }
  }

  /** The open list's keys: the arrows move the highlight, Enter picks, Esc shuts the list only. */
  private listKey(key: string): boolean {
    if (key === "ArrowUp" || key === "ArrowDown") {
      const rows = this.openRows();
      const at = rows.indexOf(this.highlight);
      const step = key === "ArrowUp" ? -1 : 1;
      const next = rows[Math.min(rows.length - 1, Math.max(0, at + step))];
      if (next !== undefined && next !== this.highlight) {
        this.highlight = next;
        this.deps.changed?.();
      }
      return true;
    }
    if (key === "Enter") {
      this.pick(this.highlight);
      return true;
    }
    if (key === "Escape") {
      this.closePicker(true);
      return true;
    }
    return false;
  }

  /** The channels the list offers that may be picked, in its order. */
  private openRows(): ChatChannel[] {
    return CHAT_SHOWN_CHANNELS.filter((c) => this.pickable.has(c));
  }

  /** Tab: the next (or, `step` -1, the previous) open channel after the current one, wrapping. */
  private cycle(step: -1 | 1): void {
    const rows = this.openRows();
    if (rows.length === 0) return;
    const at = rows.indexOf(this.deps.field.channel);
    const from = at === -1 ? (step === 1 ? -1 : 0) : at;
    const next = rows[(from + step + rows.length) % rows.length];
    if (next !== this.deps.field.channel) this.pick(next);
  }

  /**
   * ArrowUp (step -1) walks back through the sent lines, ArrowDown (step +1) forward; past the
   * newest, the player's own draft comes back. A recalled line's prefix picks its channel.
   */
  private recall(step: -1 | 1): void {
    const lines = this.deps.recall?.lines() ?? [];
    if (lines.length === 0) return;
    const field = this.deps.field;
    if (this.recalled === null) {
      if (step === 1) return;
      this.draft = field.value;
      this.recalled = lines.length - 1;
    } else if (step === -1) {
      this.recalled = Math.max(0, this.recalled - 1);
    } else if (this.recalled < lines.length - 1) {
      this.recalled += 1;
    } else {
      this.recalled = null;
    }
    field.value = this.recalled === null ? this.draft : lines[this.recalled];
    field.channel = channelOf(field.value, this.pickable);
    this.deps.changed?.();
  }

  /** The draft changed: cut it to the limit once the input method has committed, never mid-pick. */
  typed(composing: boolean): void {
    this.closePicker();
    if (composing) return;
    // an edited line is the player's own again; the arrows start over from the newest
    this.recalled = null;
    const field = this.deps.field;
    // a prefix typed or deleted at the start picks its channel, or goes back to Area
    const channel = channelOf(field.value, this.pickable);
    const clamped = clampDraft(field.value, channel);
    if (clamped !== field.value) field.value = clamped;
    field.channel = channel;
    this.deps.changed?.();
  }

  /**
   * Re-reads who owns the keys (once a frame, from the window). Losing them mid-line drops the
   * draft and closes the input (R27), unless they went to something opened by a press elsewhere
   * (`keepsDraft`): then the input closes and the draft stays. Returns whether the player may type
   * now, or undefined when nothing changed since the last reading.
   */
  sync(): boolean | undefined {
    const allowed = this.deps.mayOpen();
    if (allowed === this.lastAllowed) return undefined;
    this.lastAllowed = allowed;
    if (!allowed) {
      if (this.deps.keepsDraft?.()) this.letGo();
      else this.cancel();
    }
    return allowed;
  }

  /** Closes the input with its draft kept, the keyboard given back. */
  private letGo(): void {
    if (!this.open) return;
    this.deps.field.blur();
    this.blurred();
  }
  private lastAllowed?: boolean;

  /** The scene takes the keys back (the end-of-run overlay): close and drop the draft (R27). */
  cancel(): void {
    if (this.open) this.discardAndClose();
    else this.deps.field.value = CHAT_PREFIX[this.deps.field.channel];
  }

  /** The draft goes; the picked channel stays, its prefix ready for the next line. */
  private discardAndClose(): void {
    this.recalled = null;
    const field = this.deps.field;
    field.value = CHAT_PREFIX[field.channel];
    this.deps.field.blur();
    this.blurred();
  }
}
