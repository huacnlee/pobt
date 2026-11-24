// The pictures of items and gems (ext/pobt-native/src/art.rs): Path of Building ships none, so names lead to the
// game's art on the official site by RePoE's lists, downloaded once a week. Nothing here changes with a league.
import { Image, resource, signal, View } from "nsh";
import { Pob } from "pobt/native";
import type { Game } from "./session";

let game: Game = "poe1";
/** Bumped once the names are loaded, so pictures asked for before that are asked for again. */
const loaded = signal(0);

/** Loads the names of `g`'s items and gems (the editor does, as POB starts). */
export function loadArt(g: Game): void {
  game = g;
  void Pob.artLoad(g).then(() => loaded.set(loaded() + 1));
}

export type ArtQuery = { name: string; base?: string; unique?: boolean };

/** The pictures of several items or gems at once: their URLs, "" for one with none. Tracked: it reads again once the
 * names are loaded. */
export function artUrls(list: ArtQuery[]): string[] {
  loaded();
  return JSON.parse(Pob.artUrls(game, JSON.stringify(list.map((q) => [q.name, q.base ?? "", !!q.unique])))) as string[];
}

/** The picture of one item (`base`, `unique`) or gem (no `base`), `size` points tall, or nothing when it has none.
 * With `cell`, it takes the item's inventory shape instead, `cell` points to a cell. It is downloaded once and kept (a gem shows as the gem); the box keeps its size while it loads. */
export function GameArt(props: ArtQuery & { size?: number; cell?: number; class?: string }) {
  const picture = resource(
    () => artUrls([props])[0],
    (url) => (url ? Pob.artPicture(url) : Promise.resolve("")),
  );
  const url = () => picture() ?? "";
  const failed = signal(false);
  // With `cell`, the picture keeps the item's inventory shape (78 pixels to a cell), `cell` points to a cell.
  const box = () => {
    const side = props.size ?? 32;
    if (!props.cell || !url()) return { width: side, height: side };
    const [w, h] = JSON.parse(Pob.artSize(url())) as [number, number];
    if (!w || !h) return { width: side, height: side };
    return { width: Math.max(1, Math.round(w / 78)) * props.cell, height: Math.max(1, Math.round(h / 78)) * props.cell };
  };
  return (
    <If when={url() && !failed()} else={<View style={{ width: props.size ?? 32, height: props.size ?? 32 }} />}>
      <View class={`items-center justify-center ${props.class ?? ""}`} style={box()}>
        <Image
          src={url()}
          style={{ ...box(), objectFit: "contain" }}
          accessibilityLabel={props.name}
          onError={() => failed.set(true)}
        />
      </View>
    </If>
  );
}
