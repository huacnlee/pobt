// The hover card of an item wherever it is listed: POB's tooltip of it (ItemsTab:AddItemTooltip), with `slot` the one
// POB shows for that slot (its stat comparison against what the slot holds), as hovering in POB does. Shown beside the
// pointer (HoverCard); read from POB as the pointer arrives, so the card opens once at its final size, and kept per
// item, slot and build revision, so a card shown before opens at once while the build has not changed.
import { type JSX, Scroll, signal } from "nsh";
import { HoverCard } from "../../../ui";
import { build } from "../../session";
import { type Rarity, type TipLine, tooltipOf } from "./data";
import { ItemTip } from "./ItemTip";

const cache = new Map<string, TipLine[]>();
let cachedRevision = -1;

function cached(key: string): TipLine[] | undefined {
  // a new calculation makes every comparison stale
  if (cachedRevision !== build.revision()) {
    cache.clear();
    cachedRevision = build.revision();
  }
  return cache.get(key);
}

/** Wraps a row (`children`) in its item's hover card. */
export function ItemHover(props: { id?: number; rarity: Rarity; slot?: string; class?: string; children?: JSX.Element }) {
  const lines = signal<TipLine[] | null>(null);
  const key = () => `${props.id}|${props.slot ?? ""}`;
  const prepare = () => {
    const id = props.id;
    if (!id) return;
    const k = key();
    const hit = cached(k);
    lines.set(hit ?? null);
    if (hit) return;
    const revision = build.revision();
    tooltipOf(id, props.slot)
      .then((r) => {
        if (revision !== build.revision()) return;
        cache.set(k, r.lines);
        if (key() === k) lines.set(r.lines);
      })
      .catch(() => {});
  };
  return (
    <HoverCard
      class={props.class}
      disabled={!props.id}
      onPrepare={prepare}
      ready={() => lines() !== null}
      cardClass="w-[340px]"
      content={() => (
        <Scroll class="max-h-[480px]">
          <ItemTip lines={lines() ?? []} rarity={props.rarity} flat />
        </Scroll>
      )}
    >
      {props.children}
    </HoverCard>
  );
}
