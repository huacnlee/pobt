// An arbitrage cycle drawn as a ring: its items around a circle, an arrow for each trade from one to the next, and
// on each arrow the trade's rate, what its pair traded today and what one chaos put in is worth after it; the arrow
// that closes the loop says the net. The arrows draw in one after another (and their numbers fade in as each
// arrives), all at once with reduced motion. Screen readers hear the loop as one sentence.
import { Animated, Canvas, type CanvasRenderingContext2D, createAnimatedValue, createMotion, Easing, reduceMotion, Text, token, View } from "nsh";
import { itemName, t } from "../data/i18n";
import type { Cycle, CycleLeg } from "../data/types";
import { ItemArt } from "./ItemArt";
import { percent, price, trim } from "./format";
import { DURATION } from "../../ui";

const W = 576;
const R = 104;
/** The node's circle, and how far past it each arrow stops. */
const NODE = 48;
const GAP = (NODE / 2 + 8) / R;
const CX = W / 2;
const CY = R + NODE / 2 + 4;
/** Where a leg's numbers start: just past the ring, off the arc's middle, so they never sit on an arrow. */
const LABEL_R = R + 14;
const LABEL_W = 176;
const LABEL_H = 54;
const H = CY + LABEL_R + LABEL_H + 4;
const HEAD = 7;
/** How long each arrow takes to draw in. */
const LEG_MS = DURATION.slow;

/** Angles of the nodes, the first at the top, clockwise. */
const angleOf = (i: number, n: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

/** How a currency reads in a rate: `c` and `div` as prices are written, any other item by its name. */
function unitName(name: string): string {
  if (name === "Chaos Orb") return "c";
  if (name === "Divine Orb") return "div";
  return itemName(name);
}

const netOf = (cycle: Cycle) => {
  const legs = cycle.legs ?? [];
  return legs.length ? (legs[legs.length - 1].value - 1) * 100 : cycle.edge;
};

/** The loop as one sentence, for screen readers. */
export function cycleLabel(cycle: Cycle): string {
  const steps = (cycle.legs ?? []).map((leg) =>
    t("ring.step", { from: itemName(leg.from), to: itemName(leg.to), rate: trim(leg.rate), volume: trim(leg.volume), value: leg.value.toFixed(3) }),
  );
  return t("ring.label", { steps: steps.join(t("ring.join")), percent: percent(netOf(cycle)) });
}

function LegLabel(props: { leg: CycleLeg; index: number; count: number; divine: number; last: boolean }) {
  const mid = angleOf(props.index + 0.5, props.count);
  const x = CX + LABEL_R * Math.cos(mid);
  const y = CY + LABEL_R * Math.sin(mid);
  // Beside the ring on its sides, reading away from it; under or over it at the bottom and top.
  const side = Math.cos(mid) > 0.3 ? "right" : Math.cos(mid) < -0.3 ? "left" : "middle";
  const left = side === "right" ? x : side === "left" ? x - LABEL_W : x - LABEL_W / 2;
  const top = side !== "middle" ? y - LABEL_H / 2 : Math.sin(mid) > 0 ? y : y - LABEL_H;
  const align = side === "right" ? "items-start" : side === "left" ? "items-end" : "items-center";
  // Each label comes in as its arrow arrives.
  const enter = createMotion({ enter: "fadeIn", delay: (props.index + 0.7) * LEG_MS, duration: DURATION.base });
  return (
    <View
      style={[enter.style, { position: "absolute", left, top, width: LABEL_W, height: LABEL_H }]}
      class={`justify-center gap-0.5 ${align}`}
      testID={`ring-leg-${props.index}`}
    >
      <Text class="text-xs font-semibold tabular-nums text-foreground line-clamp-1">
        {t("ring.rate", { from: unitName(props.leg.from), rate: trim(props.leg.rate), to: unitName(props.leg.to) })}
      </Text>
      <Text class="text-xs tabular-nums text-muted-foreground line-clamp-1">
        {t("ring.volume", { n: trim(props.leg.volume), chaos: price(props.leg.volumeChaos, props.divine) })}
      </Text>
      <Text class={`text-xs tabular-nums line-clamp-1 ${props.last ? "font-semibold text-up" : "text-muted-foreground"}`}>
        {props.last
          ? t("ring.net", { value: props.leg.value.toFixed(3), percent: percent((props.leg.value - 1) * 100) })
          : t("ring.value", { value: props.leg.value.toFixed(3) })}
      </Text>
    </View>
  );
}

function Node(props: { name: string; id: string; index: number; count: number; icon?: string }) {
  const a = angleOf(props.index, props.count);
  const x = CX + R * Math.cos(a);
  const y = CY + R * Math.sin(a);
  return (
    <View style={{ position: "absolute", left: x - 56, top: y - NODE / 2, width: 112 }} class="items-center gap-1">
      <View class="items-center justify-center rounded-full border border-trim-hi/60 bg-card" style={{ width: NODE, height: NODE }}>
        <ItemArt icon={props.icon} name={itemName(props.name)} size={32} />
      </View>
      <Text class="text-center text-xs font-medium text-foreground line-clamp-2">{itemName(props.name)}</Text>
    </View>
  );
}

/**
 * The ring of `cycle` (its `legs`; nothing without them). `icons` has the items' pictures by id; `divine` the
 * divine's price, to write the volumes as prices are written.
 */
export function CycleRing(props: { cycle: Cycle; divine: number; icons?: Map<string, string>; class?: string }) {
  const legs = props.cycle.legs ?? [];
  const n = legs.length;
  // 0 to n: how many arrows are drawn, the one in flight partly.
  const progress = createAnimatedValue(reduceMotion() ? n : 0);
  if (!reduceMotion()) {
    Animated.timing(progress, { toValue: n, duration: n * LEG_MS, easing: Easing.linear }).start();
  }
  const draw = (cx: CanvasRenderingContext2D) => {
    cx.lineCap = "round";
    cx.lineJoin = "round";
    // The track: the whole circle, faint, there before the arrows.
    cx.beginPath();
    cx.arc(CX, CY, R, 0, Math.PI * 2);
    cx.strokeStyle = token("border");
    cx.lineWidth = 1;
    cx.stroke();
    for (let i = 0; i < n; i++) {
      const start = angleOf(i, n) + GAP;
      const end = angleOf(i + 1, n) - GAP;
      const length = R * (end - start);
      const color = i === n - 1 ? token("up") : token("primary");
      cx.save();
      cx.beginPath();
      cx.arc(CX, CY, R, start, end);
      cx.strokeStyle = color;
      cx.lineWidth = 2;
      cx.setLineDash([length, length]);
      cx.lineDashOffset = progress.interpolate({ inputRange: [i, i + 1], outputRange: [length, 0] });
      cx.stroke();
      cx.restore();
      // The head, along the circle's direction at its end, once the arrow gets there.
      const hx = CX + R * Math.cos(end);
      const hy = CY + R * Math.sin(end);
      const tx = -Math.sin(end);
      const ty = Math.cos(end);
      cx.save();
      cx.globalAlpha = progress.interpolate({ inputRange: [i + 0.8, i + 1], outputRange: [0, 1] });
      cx.beginPath();
      cx.moveTo(hx + tx * HEAD, hy + ty * HEAD);
      cx.lineTo(hx - tx * HEAD + ty * HEAD * 0.7, hy - ty * HEAD - tx * HEAD * 0.7);
      cx.lineTo(hx - tx * HEAD - ty * HEAD * 0.7, hy - ty * HEAD + tx * HEAD * 0.7);
      cx.closePath();
      cx.fillStyle = color;
      cx.fill();
      cx.restore();
    }
  };
  return (
    <If when={n > 0}>
      <View class={`gap-2 ${props.class ?? ""}`}>
        <View
          accessible
          role="image"
          accessibilityLabel={cycleLabel(props.cycle)}
          testID="cycle-ring"
          style={{ width: W, height: H }}
          class="self-center"
        >
          <Canvas draw={draw} style={{ position: "absolute", left: 0, top: 0, width: W, height: H }} />
          <View style={{ position: "absolute", left: CX - 60, top: CY - 22, width: 120 }} class="items-center">
            <Text class="text-xl font-semibold tabular-nums text-up">{percent(netOf(props.cycle))}</Text>
            <Text class="text-xs text-muted-foreground">{t("ring.perLoop")}</Text>
          </View>
          <Each of={legs} key="index">
            {(leg, i) => <Node name={leg().from} id={leg().fromId} index={i()} count={n} icon={props.icons?.get(leg().fromId)} />}
          </Each>
          <Each of={legs} key="index">
            {(leg, i) => <LegLabel leg={leg()} index={i()} count={n} divine={props.divine} last={i() === n - 1} />}
          </Each>
        </View>
        <View class="items-center gap-0.5">
          <Text class="text-center text-xs text-muted-foreground">{t("ring.perChaos")}</Text>
          <If when={props.cycle.usual && props.cycle.usual > 1}>
            <Text class="text-center text-xs text-muted-foreground">
              {t("ring.usualNote", { percent: (((props.cycle.usual ?? 1) - 1) * 100).toFixed(1) })}
            </Text>
          </If>
        </View>
      </View>
    </If>
  );
}
