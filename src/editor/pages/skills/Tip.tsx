// Path of Building's tooltips on the Skills page, in a card beside the pointer (ui's HoverCard): POB's own lines
// (PobTip's compact TipLines), asked for as the pointer arrives, so the card shows once at its final size.
import { type JSX, Scroll, signal } from "nsh";
import { HoverCard, Text } from "../../../ui";
import { TipLines } from "../../PobTip";
import { build } from "../../session";
import type { TipLine } from "./data";

export { TipLines } from "../../PobTip";

// POB's lines by what was asked and the calculation they came from: a tooltip read again after the pointer comes back
// is not built again (the ones comparing stats run a calculation each).
const cache = new Map<string, TipLine[]>();
const CACHE_LIMIT = 200;

function remember(key: string, lines: TipLine[]) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, lines);
}

/** POB's lines in a card that scrolls when they are longer than the screen allows, from their start. */
function Card(props: { lines: TipLine[] | null; center?: boolean }) {
  return (
    <If when={props.lines?.length} else={<Text variant="caption" tone="muted">{props.lines ? "—" : "…"}</Text>}>
      <Scroll class="max-h-[480px]">
        <TipLines lines={props.lines ?? []} center={props.center} />
      </Scroll>
    </If>
  );
}

/** `children` with POB's tooltip beside the pointer while it rests on them. `lines` gives the lines when they are at
 * hand; otherwise `load` asks POB for them (`id` names what it asks, for the cache) as the pointer arrives. */
export function PobHover(props: {
  lines?: () => TipLine[] | undefined;
  load?: () => Promise<TipLine[]>;
  id?: () => string;
  center?: boolean;
  class?: string;
  children?: JSX.Element;
}) {
  const loaded = signal<TipLine[] | null>(null);
  const lines = () => (props.lines ? (props.lines() ?? []) : loaded());
  const prepare = () => {
    if (props.lines || !props.load) return;
    const key = `${build.revision()}|${props.id?.() ?? ""}`;
    const known = props.id ? cache.get(key) : undefined;
    if (known) {
      loaded.set(known);
      return;
    }
    loaded.set(null);
    props.load().then(
      (l) => {
        if (props.id) remember(key, l);
        loaded.set(l);
      },
      () => loaded.set([]),
    );
  };
  return (
    <HoverCard
      class={props.class}
      cardClass="w-[360px]"
      onPrepare={prepare}
      ready={() => lines() !== null}
      content={() => <Card lines={lines()} center={props.center} />}
    >
      {props.children}
    </HoverCard>
  );
}
