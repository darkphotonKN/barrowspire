/**
 * The passive tree as the overlay draws it (FS-8RZ51 §G R35, R37, R42; §Edge States): from the golden
 * (structure and numbers, `@/data/passiveTree`), the character's held ranks, unspent points and level,
 * each tier with its gate, each node with its rank, its one state of five, whether the spend rule would
 * take its next rank now, and its tooltip's lines. Phaser-free, so the rule and the words are tested
 * without a canvas; `PassiveTreeOverlay` draws what this returns.
 *
 * The rule read here is the server's own (R9, `common/passivetree`), restated for the player's answer
 * only: the server decides every spend again (R13, R17).
 */

import { characterTitle } from "@/data/specializations";
import { classNodes, nodeCopy, rankEffect, type PassiveNodeDef, type PassiveNodeKind } from "@/data/passiveTree";
import type { NodeIconKey } from "./passiveIcons";
import type { CharacterSource } from "./characterSheet";

/** What the tree reads of the player's own state (R41): every field may be absent. */
export type TreeSource = Pick<CharacterSource, "class" | "level" | "passive_ranks" | "passive_points">;

/**
 * A node's state (R35): held at max, held with more to take, available (its gate met, nothing held),
 * locked (its gate not met), closed (the other tier-6 node is held).
 */
export type NodeState = "max" | "held" | "available" | "locked" | "closed";

/** One line of a node's tooltip (R37); `held` marks a rank the character holds. */
export interface TipLine {
  text: string;
  tone: "name" | "kind" | "rank" | "effect" | "kicker" | "grant" | "reason";
  held?: boolean;
}

export interface NodeView {
  id: string;
  /** Its copy's name, or its id where the copy lacks it (R42). */
  name: string;
  kind: PassiveNodeKind;
  tier: number;
  rank: number;
  maxRank: number;
  state: NodeState;
  /** Whether the spend rule would take its next rank now (R9): an available or held node with a point to spend. */
  spendable: boolean;
  /** The picture it draws (R40); none for a node the copy lacks, which draws the fallback glyph (R42). */
  icon?: NodeIconKey;
  tip: TipLine[];
}

export interface TierView {
  tier: number;
  /** Its gate in a few words, beside it (R35): "Open", "4 spent", "Needs Earthbreaker". */
  gate: string;
  nodes: NodeView[];
}

export interface TreeView {
  /** Whether the golden knows the class: one it does not draws no nodes (R42). */
  known: boolean;
  points: number;
  /** The class and the unspent points (R35): "Warrior · 3 points". */
  header: string;
  tiers: TierView[];
}

/** The overlay's footer outside town (R38; §Edge States: not in town). */
export const SPENT_IN_TOWN = "Points are spent in town.";

const KIND_WORD: Readonly<Record<PassiveNodeKind, string>> = {
  filler: "Passive",
  kicker: "Kicker",
  ability: "Ability",
  specialization: "Specialization",
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** The class's tree laid out for the overlay (R35, R37, R41, R42). */
export function treeView(source: TreeSource): TreeView {
  const nodes = classNodes(source.class);
  const ranks = source.passive_ranks ?? {};
  const points = Math.max(0, source.passive_points ?? 0);
  const rule = new TreeRule(nodes, ranks);
  const tiers = [...new Set(nodes.map((n) => n.tier))].map((tier) => {
    const inTier = nodes.filter((n) => n.tier === tier);
    return {
      tier,
      gate: gateWords(inTier[0]),
      nodes: inTier.map((n) => nodeView(n, rule, points, source)),
    };
  });
  return {
    known: nodes.length > 0,
    points,
    header: `${capital(source.class)} · ${plural(points, "point")}`,
    tiers,
  };
}

/** A node's name: its copy's, else its id (R42). */
function nameOf(id: string): string {
  return nodeCopy(id)?.name ?? id;
}

function gateWords(first: PassiveNodeDef): string {
  const { spentAbove, requires } = first.gate;
  if (requires) return `Needs ${nameOf(requires)}`;
  if (spentAbove) return `${spentAbove} spent`;
  return "Open";
}

/** The spend rule's reads over one class's nodes and the ranks held (R2, R9). */
class TreeRule {
  constructor(
    private readonly nodes: readonly PassiveNodeDef[],
    private readonly ranks: Readonly<Record<string, number>>,
  ) {}

  rank(id: string): number {
    return Math.max(0, this.ranks[id] ?? 0);
  }

  /** The ranks held in every tier with a smaller number (R2), the class's own nodes only. */
  spentAbove(tier: number): number {
    return this.nodes.filter((n) => n.tier < tier).reduce((sum, n) => sum + this.rank(n.id), 0);
  }

  /** How many more points the tiers above need, or the node to take first; none when the gate is met. */
  short(node: PassiveNodeDef): { points: number } | { requires: string } | null {
    const { spentAbove, requires } = node.gate;
    if (requires && this.rank(requires) < 1) return { requires };
    const missing = (spentAbove ?? 0) - this.spentAbove(node.tier);
    return missing > 0 ? { points: missing } : null;
  }

  /** The other tier-6 node held, when this one is a specialization and is not (R9's last rule). */
  chosen(node: PassiveNodeDef): PassiveNodeDef | undefined {
    if (node.kind !== "specialization" || this.rank(node.id) > 0) return undefined;
    return this.nodes.find((n) => n.kind === "specialization" && n.id !== node.id && this.rank(n.id) > 0);
  }
}

function nodeView(node: PassiveNodeDef, rule: TreeRule, points: number, source: TreeSource): NodeView {
  const rank = Math.min(rule.rank(node.id), node.maxRank);
  const chosen = rule.chosen(node);
  const short = rule.short(node);
  const state: NodeState = chosen
    ? "closed"
    : rank >= node.maxRank
      ? "max"
      : rank > 0
        ? "held"
        : short
          ? "locked"
          : "available";
  const spendable = (state === "available" || state === "held") && points >= 1;
  const reason = reasonFor(state, chosen, short, points, source.level);
  return {
    id: node.id,
    name: nameOf(node.id),
    kind: node.kind,
    tier: node.tier,
    rank,
    maxRank: node.maxRank,
    state,
    spendable,
    icon: nodeCopy(node.id)?.icon,
    tip: tipLines(node, rank, source, reason),
  };
}

/** Why a node's next rank cannot be taken now, in §Edge States' words; none for one that can, or at max. */
function reasonFor(
  state: NodeState,
  chosen: PassiveNodeDef | undefined,
  short: ReturnType<TreeRule["short"]>,
  points: number,
  level: number | undefined,
): string | undefined {
  if (chosen) return `You chose ${nameOf(chosen.id)}.`;
  if (state === "locked" && short)
    return "points" in short ? `Spend ${plural(short.points, "more point")} above to open this tier.` : `Take ${nameOf(short.requires)} first.`;
  if (state === "max" || points >= 1) return undefined;
  return (level ?? 1) <= 1 ? "Reach level 2 for your first point." : "No points to spend.";
}

/**
 * A node's tooltip (R37): its name, its kind, its rank, each rank's effect with the held ones marked
 * and a kicker's R3 rule labelled as the last rank's; the tier-3 node's ability and its key, a tier-6
 * node's title and its look; why it cannot be taken, where it cannot.
 */
function tipLines(node: PassiveNodeDef, rank: number, source: TreeSource, reason: string | undefined): TipLine[] {
  const copy = nodeCopy(node.id);
  const lines: TipLine[] = [
    { text: nameOf(node.id), tone: "name" },
    { text: `${KIND_WORD[node.kind] ?? capital(node.kind)} · tier ${node.tier}`, tone: "kind" },
    { text: `Rank ${rank} / ${node.maxRank}`, tone: "rank" },
  ];
  if (node.perRank) {
    const effect = rankEffect(node.perRank);
    for (let r = 1; r <= node.maxRank; r++) lines.push({ text: `Rank ${r}: ${effect}`, tone: "effect", held: r <= rank });
  }
  if (node.kind === "kicker" && copy?.kicker)
    lines.push({ text: `Rank ${node.maxRank} kicker: ${copy.kicker}`, tone: "kicker", held: rank >= node.maxRank });
  // placeholder words; FS-04EEA and FS-E1ZDG own them (R37)
  if (node.kind === "ability") lines.push({ text: `Grants ${nameOf(node.id)}, cast with 3.`, tone: "grant", held: rank > 0 });
  if (node.kind === "specialization") {
    const title = characterTitle(source.class, copy?.specialization) ?? nameOf(node.id);
    lines.push({ text: `Grants the title ${title}. Your look changes.`, tone: "grant", held: rank > 0 });
  }
  if (reason) lines.push({ text: reason, tone: "reason" });
  return lines;
}

/** How long a spend sent holds its node's clicks with no answer (R38): after it, a retry may go. */
export const SPEND_IN_FLIGHT_MS = 5000;

/**
 * The overlay's spends (R38), Phaser-free: a click on a node the model calls spendable sends its next
 * rank, save on tier 6, which asks once first ("Choose <name>? <other> is gone for good."). While a spend
 * is in flight its node takes no second click, until the state shows the rank, a refusal arrives, or
 * `SPEND_IN_FLIGHT_MS` pass; a retry then is the same target rank, which the server takes as a no-op
 * once it has landed (R10, R22). A refusal's reason stands until the next click or the tree closing.
 * The spend rule is the server's: nothing here refuses beyond the model's `spendable`.
 */
export class TreeSpend {
  /** Each node's spend in flight: its target rank and when it went. */
  private readonly inFlight = new Map<string, { rank: number; at: number }>();
  private ask?: { id: string; rank: number; words: string };
  private refusal?: string;

  constructor(
    /** Sends the spend; whether it went (it goes only in town). */
    private readonly send: (nodeId: string, rank: number) => boolean,
    private readonly now: () => number = Date.now,
  ) {}

  /** A click on `node` in `view`, the tree as drawn. */
  press(node: NodeView, view: TreeView): void {
    this.refusal = undefined;
    this.ask = undefined;
    if (!node.spendable || this.held(node.id)) return;
    const rank = node.rank + 1;
    if (node.kind !== "specialization") return this.go(node.id, rank);
    const other = view.tiers.find((t) => t.tier === node.tier)?.nodes.find((n) => n.id !== node.id);
    this.ask = { id: node.id, rank, words: `Choose ${node.name}? ${other?.name ?? "The other"} is gone for good.` };
  }

  /** The tier-6 ask answered: yes sends it, no sends nothing. */
  answer(yes: boolean): void {
    const ask = this.ask;
    this.ask = undefined;
    if (yes && ask && !this.held(ask.id)) this.go(ask.id, ask.rank);
  }

  /** The server refused a spend: its reason shows, and no node waits on an answer any more. */
  refused(reason: string): void {
    this.inFlight.clear();
    this.refusal = reason;
  }

  /** The state as drawn now: a node showing its target rank is answered. */
  seen(view: TreeView): void {
    for (const node of view.tiers.flatMap((t) => t.nodes)) {
      const sent = this.inFlight.get(node.id);
      if (sent && node.rank >= sent.rank) this.inFlight.delete(node.id);
    }
  }

  /** The tree closed, or a press off every node: its refusal and its ask go; a spend in flight still holds its node. */
  clear(): void {
    this.refusal = undefined;
    this.ask = undefined;
  }

  /** The refusal's reason standing, if one does. */
  line(): string | undefined {
    return this.refusal;
  }

  /** The tier-6 ask standing, if one does. */
  asking(): string | undefined {
    return this.ask?.words;
  }

  private held(id: string): boolean {
    const sent = this.inFlight.get(id);
    return !!sent && this.now() - sent.at < SPEND_IN_FLIGHT_MS;
  }

  private go(id: string, rank: number): void {
    if (this.send(id, rank)) this.inFlight.set(id, { rank, at: this.now() });
  }
}
