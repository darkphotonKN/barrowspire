/**
 * The passive tree as the overlay draws it (FS-8RZ51 §G R37, R42; §Change: Tree v2 V23, V25, V26, V28;
 * §Edge States): from the golden (structure and numbers, `@/data/passiveTree`), the character's held
 * ranks, unspent points and level, each node with its depth, its rank, its one state of five, whether
 * the spend rule would take its next rank now, and its tooltip's lines. Until slice 17 draws the graph
 * the nodes stand in one row per depth. Phaser-free, so the rule and the words are tested without a
 * canvas; `PassiveTreeOverlay` draws what this returns.
 *
 * The rule read here is the server's own (V5, `common/passivetree`), restated for the player's answer
 * only (V28): reachability, `minLevel` and sides, read from the nodes' data and never a slot name
 * (V11). The server decides every spend again (R13, R17).
 */

import { characterTitle } from "@/data/specializations";
import { classNodes, nodeCopy, rankEffect, type PassiveNodeDef, type PassiveNodeKind } from "@/data/passiveTree";
import type { NodeIconKey } from "./passiveIcons";
import type { CharacterSource } from "./characterSheet";

/** What the tree reads of the player's own state (R41): every field may be absent. */
export type TreeSource = Pick<CharacterSource, "class" | "level" | "passive_ranks" | "passive_points">;

/**
 * A node's state (V25): held at max, held with more to take, available (reachable, its side not
 * taken), closed (not reachable yet: no link held, or the level too low), locked (another side of its
 * group taken, for good).
 */
export type NodeState = "max" | "held" | "available" | "closed" | "locked";

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
  /** 0 for the root, else one more than its shallowest link (V23). */
  depth: number;
  rank: number;
  maxRank: number;
  state: NodeState;
  /** Whether the spend rule would take its next rank now (V5): an available or held node with a point to spend. */
  spendable: boolean;
  /** The picture it draws (R40); none for a node the copy lacks, which draws the fallback glyph (R42). */
  icon?: NodeIconKey;
  tip: TipLine[];
}

/** One depth's nodes, in the definition's order: the interim row until slice 17 draws the graph. */
export interface DepthRow {
  depth: number;
  nodes: NodeView[];
}

export interface TreeView {
  /** Whether the golden knows the class: one it does not draws no nodes (R42). */
  known: boolean;
  points: number;
  /** The class and the unspent points (R35): "Warrior · 3 points". */
  header: string;
  rows: DepthRow[];
}

/** The overlay's footer outside town (R38; §Edge States: not in town). */
export const SPENT_IN_TOWN = "Points are spent in town.";

const KIND_WORD: Readonly<Record<PassiveNodeKind, string>> = {
  traversal: "Passive",
  kicker: "Kicker",
  ability: "Ability",
  specialization: "Specialization",
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/**
 * The class's tree for the overlay (V23, V25, R37, R41, R42). `nodes` defaults to the class's from
 * the golden; any tree that is only data is ruled on and laid out the same (V11).
 */
export function treeView(source: TreeSource, nodes: readonly PassiveNodeDef[] = classNodes(source.class)): TreeView {
  const points = Math.max(0, source.passive_points ?? 0);
  const rule = new TreeRule(nodes, source.passive_ranks ?? {}, source.level ?? 1);
  const views = nodes.map((n) => nodeView(n, rule, points, source));
  const depths = [...new Set(views.map((n) => n.depth))].sort((a, b) => a - b);
  return {
    known: nodes.length > 0,
    points,
    header: `${capital(source.class)} · ${plural(points, "point")}`,
    rows: depths.map((depth) => ({ depth, nodes: views.filter((n) => n.depth === depth) })),
  };
}

/** A node's name: its copy's, else its id (R42). */
function nameOf(id: string): string {
  return nodeCopy(id)?.name ?? id;
}

/** Why a node is not reachable yet (V5): the links none of which is held, the level it waits for. */
interface Unreached {
  links?: readonly string[];
  level?: number;
}

/**
 * The spend rule's reads over one tree's nodes, the ranks held and the level (V5, V6). A rank on an id
 * the tree does not define counts for nothing (V8, V21).
 */
class TreeRule {
  private readonly byId: ReadonlyMap<string, PassiveNodeDef>;
  private readonly depths = new Map<string, number>();

  constructor(
    private readonly nodes: readonly PassiveNodeDef[],
    private readonly ranks: Readonly<Record<string, number>>,
    private readonly level: number,
  ) {
    this.byId = new Map(nodes.map((n) => [n.id, n]));
  }

  rank(id: string): number {
    const node = this.byId.get(id);
    return node && Object.hasOwn(this.ranks, id) ? Math.min(Math.max(0, this.ranks[id]), node.maxRank) : 0;
  }

  /** 0 for a node with no link the tree defines, else one more than its shallowest link's (V23). */
  depth(node: PassiveNodeDef, seen: ReadonlySet<string> = new Set()): number {
    const known = this.depths.get(node.id);
    if (known !== undefined) return known;
    const path = new Set(seen).add(node.id);
    const links = node.requires.flatMap((id) => {
      const link = this.byId.get(id);
      return link && !path.has(id) ? [this.depth(link, path)] : [];
    });
    const depth = links.length ? 1 + Math.min(...links) : 0;
    this.depths.set(node.id, depth);
    return depth;
  }

  /** The held node of another side of this node's group, if one is (V6); the first in the definition's order. */
  sideTaken(node: PassiveNodeDef): PassiveNodeDef | undefined {
    const own = node.exclusive;
    if (!own) return undefined;
    return this.nodes.find((n) => n.exclusive?.group === own.group && n.exclusive.side !== own.side && this.rank(n.id) > 0);
  }

  /** What keeps a node from reach (V5): none of its links held, or the level short of its gate; none when reachable. */
  unreached(node: PassiveNodeDef): Unreached | undefined {
    const unlinked = node.requires.length > 0 && !node.requires.some((id) => this.rank(id) > 0);
    const short = this.level < node.minLevel;
    if (!unlinked && !short) return undefined;
    return { links: unlinked ? node.requires : undefined, level: short ? node.minLevel : undefined };
  }

  /**
   * The name a locked side is chosen by (V25): the held side's kicker, else its specialization, else
   * "the other side" for a side with neither.
   */
  chosenName(taken: PassiveNodeDef): string {
    const side = this.nodes.filter((n) => n.exclusive?.group === taken.exclusive?.group && n.exclusive?.side === taken.exclusive?.side);
    const headline = side.find((n) => n.kind === "kicker") ?? side.find((n) => n.kind === "specialization");
    return headline ? nameOf(headline.id) : "the other side";
  }
}

function nodeView(node: PassiveNodeDef, rule: TreeRule, points: number, source: TreeSource): NodeView {
  const rank = rule.rank(node.id);
  const taken = rank >= node.maxRank ? undefined : rule.sideTaken(node);
  const unreached = rank > 0 ? undefined : rule.unreached(node);
  const state: NodeState = rank >= node.maxRank ? "max" : taken ? "locked" : rank > 0 ? "held" : unreached ? "closed" : "available";
  const spendable = (state === "available" || state === "held") && points >= 1;
  return {
    id: node.id,
    name: nameOf(node.id),
    kind: node.kind,
    depth: rule.depth(node),
    rank,
    maxRank: node.maxRank,
    state,
    spendable,
    icon: nodeCopy(node.id)?.icon,
    tip: tipLines(node, rank, source, reasons(state, taken && rule.chosenName(taken), unreached, points, source.level)),
  };
}

/** Why a node's next rank cannot be taken now, in V26's and §Edge States' words; none for one that can, or at max. */
function reasons(state: NodeState, chosen: string | undefined, unreached: Unreached | undefined, points: number, level: number | undefined): string[] {
  if (state === "locked") return [`Locked: you chose ${chosen}.`];
  if (state === "closed" && unreached) {
    const lines: string[] = [];
    if (unreached.links) lines.push(`Not reachable yet: take ${[...new Set(unreached.links.map(nameOf))].join(" or ")} first.`);
    if (unreached.level) lines.push(`Not reachable yet: reach level ${unreached.level}.`);
    return lines;
  }
  if (state === "max" || points >= 1) return [];
  return [(level ?? 1) <= 1 ? "Reach level 2 for your first point." : "No points to spend."];
}

/**
 * A node's tooltip (R37, V26): its name, its kind, its rank, each rank's effect with the held ones
 * marked and a kicker's R3 rule labelled as the last rank's; the ability and its key, a
 * specialization's title and its look; why it cannot be taken, where it cannot.
 */
function tipLines(node: PassiveNodeDef, rank: number, source: TreeSource, why: readonly string[]): TipLine[] {
  const copy = nodeCopy(node.id);
  const lines: TipLine[] = [
    { text: nameOf(node.id), tone: "name" },
    { text: KIND_WORD[node.kind] ?? capital(node.kind), tone: "kind" },
    { text: `Rank ${rank} / ${node.maxRank}`, tone: "rank" },
  ];
  if (node.perRank) {
    const effect = rankEffect(node.perRank);
    for (let r = 1; r <= node.maxRank; r++) lines.push({ text: `Rank ${r}: ${effect}`, tone: "effect", held: r <= rank });
  }
  if (node.kind === "kicker" && copy?.kicker)
    lines.push({ text: `Rank ${node.maxRank} kicker: ${copy.kicker}`, tone: "kicker", held: rank >= node.maxRank });
  // placeholder words; FS-04EEA and FS-E1ZDG own them, and slice 18 rewrites them (V26)
  if (node.kind === "ability") lines.push({ text: `Grants ${nameOf(node.id)}, cast with 3.`, tone: "grant", held: rank > 0 });
  if (node.kind === "specialization") {
    const title = characterTitle(source.class, copy?.specialization) ?? nameOf(node.id);
    lines.push({ text: `Grants the title ${title}. Your look changes.`, tone: "grant", held: rank > 0 });
  }
  for (const text of why) lines.push({ text, tone: "reason" });
  return lines;
}

/** How long a spend sent holds its node's clicks with no answer (R38): after it, a retry may go. */
export const SPEND_IN_FLIGHT_MS = 5000;

/**
 * The overlay's spends (R38), Phaser-free: a click on a node the model calls spendable sends its next
 * rank, save on a specialization, which asks once first ("Choose <name>? <other> is gone for good."). While a spend
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
    const other = view.rows.flatMap((r) => r.nodes).find((n) => n.kind === "specialization" && n.id !== node.id);
    this.ask = { id: node.id, rank, words: `Choose ${node.name}? ${other?.name ?? "The other"} is gone for good.` };
  }

  /** The specialization's ask answered: yes sends it, no sends nothing. */
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
    for (const node of view.rows.flatMap((r) => r.nodes)) {
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

  /** The specialization's ask standing, if one does. */
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
