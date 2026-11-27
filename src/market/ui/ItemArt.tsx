// An item's picture, as the game draws it (poe.ninja gives its path on the game's CDN), from the copy kept on disk
// (data/art.ts). Like POBT's: a box of fixed size, so rows never move when it loads; the picture appears once loaded,
// and nothing shows when it fails.
import { Image, resource, signal, View } from "nsh";
import { artSource, CDN, dropArt } from "../data/art";

export function ItemArt(props: { icon?: string; name: string; size?: number; class?: string }) {
  const failed = signal(false);
  // The URL shown instead of a kept file that would not show.
  const fallback = signal<string | null>(null);
  const side = () => props.size ?? 32;
  // A recycled row shows another item: the source follows the icon.
  const src = resource(
    () => props.icon,
    (icon) => {
      failed.set(false);
      fallback.set(null);
      return artSource(icon);
    },
  );
  return (
    <View class={`items-center justify-center ${props.class ?? ""}`} style={{ width: side(), height: side() }}>
      <If when={props.icon && src() && !failed()}>
        <Image
          src={fallback() ?? src()!}
          style={{ width: side(), height: side(), objectFit: "contain" }}
          accessibilityLabel={props.name}
          onError={() => {
            const shown = fallback() ?? src()!;
            if (shown.startsWith(CDN) || !props.icon) failed.set(true);
            else fallback.set(dropArt(props.icon));
          }}
        />
      </If>
    </View>
  );
}
