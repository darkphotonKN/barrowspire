"use client";

import { useId, useMemo, useRef, useState, type RefObject } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import ItemIcon from "@/components/ItemIcon";
import { useDialogFocus } from "@/components/bazaar/useDialogFocus";
import {
  DURATIONS,
  NOTHING_LISTABLE,
  canSubmitListing,
  parseStartPrice,
  pickerCards,
  type DurationId,
  type PickerCard,
} from "@/marketplace/listRelic";
import type { InstancesState } from "@/marketplace/useItemInstances";

/**
 * The List-a-relic drawer (FS-8EGFA req 25; design guideline Part II "Item grid"). The delver
 * picks one of their relics from a card grid, sets a start price and a duration, and submits.
 * `onSubmit` resolves to an error message to show, or null once the listing is posted, when the
 * page closes the drawer. Esc and the close control dismiss it; focus stays inside while open
 * and returns to `returnFocus` on close.
 */
export default function ListRelicDrawer({
  instances,
  onSubmit,
  onClose,
  returnFocus,
}: {
  instances: InstancesState;
  onSubmit: (itemId: string, startPrice: number, duration: DurationId) => Promise<string | null>;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const priceId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(panel, { onClose, returnFocus });

  const cards = useMemo(() => pickerCards(instances.items), [instances.items]);
  const [selectedId, setSelectedId] = useState<string>();
  const [priceText, setPriceText] = useState("");
  const [duration, setDuration] = useState<DurationId>("24h");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const nothingListable = instances.phase === "ready" && !cards.some((c) => c.selectable);
  const ready = canSubmitListing({ cards, selectedId, priceText, submitting });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const startPrice = parseStartPrice(priceText);
    if (!ready || !selectedId || startPrice === null) return;
    setSubmitting(true);
    setError(undefined);
    const message = await onSubmit(selectedId, startPrice, duration);
    // On success the page unmounts the drawer; only a refusal lands back here.
    if (message) {
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--color-bg-darker) 75%, transparent)" }}
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-2xl flex-col gap-6 overflow-y-auto border-l border-[color:var(--color-border-strong)] bg-bg-darker px-4 py-6 shadow-[var(--shadow-card)] sm:px-8"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-xl font-semibold text-vellum">
            List a relic
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-[6px] text-vellum-dim hover:text-brass-bright"
          >
            <XMarkIcon aria-hidden className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-3">
            <legend className="login-label mb-3">Choose a relic</legend>
            {instances.phase === "loading" && instances.items.length === 0 ? (
              <p className="text-vellum-dim" role="status">
                Opening your stash…
              </p>
            ) : instances.phase === "failed" && instances.items.length === 0 ? (
              <p className="text-vellum-dim" role="status">
                {instances.error}
              </p>
            ) : (
              <>
                {nothingListable && (
                  <p className="text-vellum-dim" role="status">
                    {NOTHING_LISTABLE}
                  </p>
                )}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                  {cards.map((card) => (
                    <RelicCard
                      key={card.id}
                      card={card}
                      selected={card.id === selectedId}
                      onSelect={() => setSelectedId(card.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            <label htmlFor={priceId} className="login-label">
              Start price (gold)
            </label>
            <input
              id={priceId}
              className="login-input max-w-[16rem] tabular-nums"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="50"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              aria-describedby={`${priceId}-hint`}
            />
            <span id={`${priceId}-hint`} className="text-xs text-vellum-muted">
              A whole number, 1 or more.
            </span>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="login-label mb-2">Duration</legend>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => {
                const active = d.id === duration;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDuration(d.id)}
                    className={`min-h-[40px] rounded-[6px] border px-4 text-xs font-semibold uppercase tracking-[0.1em] transition-colors ${
                      active
                        ? "border-brass-bright text-brass-bright"
                        : "border-[color:var(--color-border-strong)] text-vellum-dim hover:text-vellum"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!ready || nothingListable}
              className="btn-primary min-h-[40px] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:transform-none"
            >
              {submitting ? "Posting…" : "List a relic"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary min-h-[40px]">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * One relic in the picker (guideline Part II "Item card"): icon, name, stats, and no price. A
 * relic already listed or in escrow is the disabled card state, tagged. The chosen card is
 * brass-bright, never amber: the drawer's submit holds the torch.
 */
function RelicCard({
  card,
  selected,
  onSelect,
}: {
  card: PickerCard;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={!card.selectable}
      onClick={onSelect}
      className={`flex min-h-[40px] flex-col gap-3 rounded-[8px] border bg-card p-4 text-left transition-colors ${
        selected
          ? "border-brass-bright"
          : "border-[color:var(--color-border)] enabled:hover:border-[color:var(--color-border-strong)] enabled:hover:bg-card-2"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <div className="flex items-start justify-between gap-2">
        <ItemIcon item={card.icon} size={48} />
        {card.tag && (
          <span className="rounded border border-[color:var(--color-border-strong)] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-vellum-dim">
            {card.tag}
          </span>
        )}
      </div>
      <span className={`font-semibold ${selected ? "text-brass-bright" : "text-vellum"}`}>
        {card.name}
      </span>
      {card.stats.length > 0 && (
        <>
          <span aria-hidden className="h-px w-full bg-[color:var(--color-border)]" />
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-vellum-dim">
            {card.stats.map((s) => (
              <div key={s.label} className="flex gap-1">
                <dt>{s.label}</dt>
                <dd className="tabular-nums text-vellum">{s.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </button>
  );
}
