// The passive tree drawn on one canvas from Path of Building's own layout: connections (lines and orbit arcs), nodes
// by kind, the allocated ones lit; drag to pan, wheel / pinch / buttons to zoom, hover for POB's node tooltip, click to
// allocate or deallocate. Panning and zooming move animated values the drawing reads, so the tree is recorded again
// only when what it shows changes; hover, path and search marks are a second, light canvas on top.
import { type AnimatedNode, Canvas, type CanvasRenderingContext2D, createAnimatedValue, signal, token, View } from "nsh";
import { Button, Divider, Peek, Text } from "../../../ui";
import { ColoredText, plain } from "../../ColoredText";
import { TipLines } from "../../PobTip";
import { tr } from "../../i18n";
import { ART_SCALE, type Art, connectorBounds, drawConnector, drawSized, drawSprite, type NodeSprites, spriteExtent } from "./art";
import { type Edge, edgeKey, nodeAt, type NodeKind, type PlacedNode, type TreeModel } from "./model";
import { type TreeKey, tt } from "./strings";

/** A line of POB's node tooltip (PassiveTreeView:AddNodeTooltip). */
export type TipLine = { text?: string; size?: number; sep?: boolean };

/** A socketed jewel: its socket, its art (a POB asset name), its radius rings' art and sizes, and where they go. */
export type Jewel = [number, string, string, number, number, number, number];

export type TreeViewProps = {
  model: TreeModel | undefined;
  alloc: Set<number>;
  className: string;
  /** PassiveTreeView's saved view of the build (tree.lua `read`): zoomLevel, and the tree centre's offset in pixels. */
  view?: { level: number; x: number; y: number };
  /** POB's number of the build's class (its background art). */
  classId: number;
  /** POB's tree art; the tree is drawn plain until it has loaded. */
  art: Art | undefined;
  /** The ascendancies the build has (POB's ids): their nodes are drawn in full, the others faint. */
  ascendancies: string[];
  /** The nodes a click on the hovered node would allocate (PassiveTreeView's hover path). */
  hoverPath: number[];
  /** The build's socketed jewels (tree.lua `read`): `[id, overlay, ring, outer, inner, x, y]`. */
  jewels: Jewel[];
  /** The nodes a click on the hovered node would deallocate. */
  hoverDepends: number[];
  matches: Set<number>;
  hovered: number | null;
  /** POB's tooltip of the hovered node, once read. */
  tip: TipLine[] | undefined;
  onHover: (id: number | null) => void;
  onPick: (id: number) => void;
  /** What the tooltip says a click does, for the hovered node. */
  action: string;
  /** A node to bring into view (a search result chosen from the list). */
  focus?: { id: number; seq: number };
};

const TAU = Math.PI * 2;
/** The time, in POB's units (GetTime × 0.00003), the jewel rings are drawn at: about 35° apart, a pair. */
const RING_TIME = 0.25;

type Rect = { x0: number; y0: number; x1: number; y1: number };

export function TreeView(props: TreeViewProps) {
  // the view: screen = pan + scale × tree; animated values the canvases read natively, and their copy here for hit tests
  const panX = createAnimatedValue(0);
  const panY = createAnimatedValue(0);
  const scale = createAnimatedValue(0.03);
  const inv: AnimatedNode = createAnimatedValue(1).div(scale);
  /** A width of `screen` points plus `world` tree units. */
  const width = (screen: number, world = 0) => inv.mul(screen).add(world);
  let view = { x: 0, y: 0, s: 0.03 };
  let size = { width: 0, height: 0 };
  let fitted: string | null = null;
  let focused = 0;
  let dragging = false;
  const pointer = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  const canvasSize = signal({ width: 0, height: 0 });
  /** Changes with the view, for what follows it outside the canvases (the tooltip's anchor). */
  const viewTick = signal(0);
  let ticks = 0;
  /** The part of the tree recorded: the view and a view's width and height around it. */
  const cull = signal<Rect | null>(null);
  const recull = () => {
    if (!size.width || !size.height) return;
    const v = { x0: -view.x / view.s, y0: -view.y / view.s, x1: (size.width - view.x) / view.s, y1: (size.height - view.y) / view.s };
    const c = cull();
    const w = v.x1 - v.x0;
    // kept while the view is inside it and not far smaller (zoomed in a long way, a smaller area records faster)
    if (c && v.x0 >= c.x0 && v.y0 >= c.y0 && v.x1 <= c.x1 && v.y1 <= c.y1 && c.x1 - c.x0 <= w * 6) return;
    const h = v.y1 - v.y0;
    cull.set({ x0: v.x0 - w, y0: v.y0 - h, x1: v.x1 + w, y1: v.y1 + h });
  };

  // PassiveTreeView's zoom: min(width, height) / tree.size × 1.2 ^ zoomLevel, zoomLevel 0 to 12 (its Zoom clamps there)
  const pobScale = (level: number) => {
    const m = props.model;
    return m && m.size > 0 ? (Math.min(size.width, size.height) / m.size) * 1.2 ** level : 0;
  };
  const limits = () => {
    if (!props.model || !size.width) return { min: 0.01, max: 0.6 };
    return { min: pobScale(0), max: pobScale(12) };
  };

  const setView = (x: number, y: number, s: number) => {
    view = { x, y, s };
    panX.set(x);
    panY.set(y);
    scale.set(s);
    viewTick.set(++ticks);
    recull();
  };

  const fit = () => {
    const m = props.model;
    if (!m || !size.width || !size.height) return;
    const b = m.bounds;
    const s = Math.min(size.width / (b.x1 - b.x0), size.height / (b.y1 - b.y0));
    setView(size.width / 2 - ((b.x0 + b.x1) / 2) * s, size.height / 2 - ((b.y0 + b.y1) / 2) * s, s);
    fitted = m.key.split(":")[0]!;
  };

  /** The view POB opens the build with: its saved zoomLevel and offset (PassiveTreeView's zoomX / zoomY: where the
   * tree's centre is, in pixels from the view's centre); the whole tree without them. */
  const openView = () => {
    const m = props.model;
    if (!m || !size.width || !size.height) return;
    const v = props.view;
    const s = pobScale(v?.level ?? 3);
    if (!s) {
      fit();
      return;
    }
    setView(size.width / 2 + (v?.x ?? 0), size.height / 2 + (v?.y ?? 0), s);
    fitted = m.key.split(":")[0]!;
  };

  // PassiveTreeView zooms about the pointer
  const zoomAbout = (px: number, py: number, factor: number) => {
    const { min, max } = limits();
    // "fit" may show the tree smaller than POB's least zoom: zooming out from there stays where it is
    const s = Math.min(max, Math.max(Math.min(min, view.s), view.s * factor));
    const k = s / view.s;
    setView(px - (px - view.x) * k, py - (py - view.y) * k, s);
  };

  const zoomButtons = (how: "in" | "out") => zoomAbout(size.width / 2, size.height / 2, how === "in" ? 1.4 : 1 / 1.4);

  /** Centres node `id`, zoomed in enough to read it. */
  const centre = (id: number) => {
    const n = props.model?.byId.get(id);
    if (!n || !size.width) return;
    const s = Math.max(view.s, 0.12);
    setView(size.width / 2 - n.x * s, size.height / 2 - n.y * s, s);
    pointer.set({ x: size.width / 2, y: size.height / 2 });
  };

  const toTree = (p: { x: number; y: number }) => ({ x: (p.x - view.x) / view.s, y: (p.y - view.y) / view.s });

  const hover = (p: { x: number; y: number }) => {
    const m = props.model;
    if (!m || dragging) return;
    const t = toTree(p);
    const id = nodeAt(m, t.x, t.y)?.id ?? null;
    if (id !== props.hovered) props.onHover(id);
    if (id !== null) pointer.set(p);
  };

  const onKey = (key: string) => {
    const step = 80;
    if (key === "ArrowLeft") setView(view.x + step, view.y, view.s);
    else if (key === "ArrowRight") setView(view.x - step, view.y, view.s);
    else if (key === "ArrowUp") setView(view.x, view.y + step, view.s);
    else if (key === "ArrowDown") setView(view.x, view.y - step, view.s);
    else if (key === "+" || key === "=") zoomButtons("in");
    else if (key === "-") zoomButtons("out");
    else if (key === "0") fit();
  };

  const edgePath = (cx: CanvasRenderingContext2D, e: Edge) => {
    if (e.arc) {
      cx.moveTo(e.cx + e.r * Math.cos(e.a0), e.cy + e.r * Math.sin(e.a0));
      cx.arc(e.cx, e.cy, e.r, e.a0, e.a0 + e.sweep);
    } else {
      cx.moveTo(e.x1, e.y1);
      cx.lineTo(e.x2, e.y2);
    }
  };

  const circles = (cx: CanvasRenderingContext2D, nodes: PlacedNode[], grow = 0) => {
    cx.beginPath();
    for (const n of nodes) {
      const r = n.r + grow;
      cx.moveTo(n.x + r, n.y);
      cx.arc(n.x, n.y, r, 0, TAU);
    }
  };

  /** Whether (`x`, `y`) ± `r` is inside the recorded area. */
  const inside = (c: Rect, x: number, y: number, r: number) => x + r >= c.x0 && x - r <= c.x1 && y + r >= c.y0 && y - r <= c.y1;

  // what the tree shows, in PassiveTreeView:Draw's order with POB's own art: the background, the class's art, group
  // backgrounds; masteries and effects (layer 15); connectors (layer 20); the other nodes, socketed jewels and jewel
  // radius rings (layer 25). Only what lies in the recorded area (the view and a view's width around it) is
  // recorded; it is recorded again when the allocation, the art, the jewels, the class or that area changes, never
  // while panning or zooming inside it.
  const drawTree = (cx: CanvasRenderingContext2D) => {
    const m = props.model;
    const c = cull();
    if (!m || !c) return;
    const art = props.art;
    const alloc = props.alloc;
    const own = new Set(props.ascendancies);

    cx.translate(panX, panY);
    cx.scale(scale, scale);
    cx.lineCap = "round";

    if (!art) {
      drawPlain(cx, m, c);
      return;
    }

    // the background, tiled from the tree's origin (bg.width × 1.33 × 2.5 a tile), over the tree only
    const bg = art.data.sprites[art.data.background - 1];
    if (bg) {
      const tile = bg[5] * (art.data.artScale ?? ART_SCALE) * 2.5;
      const b = m.bounds;
      const x1 = Math.min(c.x1, b.x1);
      const y1 = Math.min(c.y1, b.y1);
      for (let tx = Math.floor(Math.max(c.x0, b.x0) / tile) * tile; tx < x1; tx += tile) {
        for (let ty = Math.floor(Math.max(c.y0, b.y0) / tile) * tile; ty < y1; ty += tile) {
          drawSized(cx, art, art.data.background, tx + tile / 2, ty + tile / 2, tile, tile);
        }
      }
    }
    // PoE2: an ascendancy's background in place of its class's ("*"), and the lit ring turned
    const mine = art.data.classArt.filter((a) => a[0] === props.classId);
    const ascShown = mine.some((a) => a[4] && a[4] !== "*" && own.has(a[4]));
    for (const [, s, x, y, who, angle] of mine) {
      if (who === "*" ? ascShown : who && !own.has(who)) continue;
      if (angle) {
        cx.save();
        cx.translate(x, y);
        cx.rotate(angle);
        drawSprite(cx, art, s, 0, 0);
        cx.restore();
      } else drawSprite(cx, art, s, x, y);
    }
    for (const g of art.data.groups) {
      const ext = spriteExtent(art, g[2]);
      if (!ext || !inside(c, g[0], g[1], Math.max(ext.hw, ext.hh * 2))) continue;
      const asc = art.groupAsc(g);
      cx.globalAlpha = asc && !own.has(asc) ? 0.5 : 1;
      drawSprite(cx, art, g[2], g[0], g[1], g[3] === 1);
    }
    cx.globalAlpha = 1;

    const nodes: { n: PlacedNode; s: NodeSprites; on: boolean }[] = [];
    for (const n of m.nodes) {
      const s = art.byNode.get(n.id);
      if (s && inside(c, n.x, n.y, 400)) nodes.push({ n, s, on: alloc.has(n.id) });
    }

    // layer 15: masteries, and effect art
    for (const { n, s, on } of nodes) {
      if (s.effect > 0 || (s.effect < 0 && on)) drawSprite(cx, art, Math.abs(s.effect), n.x, n.y);
      if (s.under) drawSprite(cx, art, on ? s.baseOn : s.baseOff, n.x, n.y);
    }

    // layer 20: connectors, Active between allocated nodes; other ascendancies' greyed (POB tints them 0.75)
    for (const k of art.data.connectors) {
      const a = m.byId.get(k[0]!);
      const b = m.byId.get(k[1]!);
      if (!a || !b) continue;
      const box = connectorBounds(k);
      if (!inside(c, box.x, box.y, box.r)) continue;
      const foreign = !!a.ascendancy && !own.has(a.ascendancy);
      cx.globalAlpha = foreign ? 0.75 : 1;
      drawConnector(cx, art, k, alloc.has(k[0]!) && alloc.has(k[1]!) ? 2 : 0);
    }
    cx.globalAlpha = 1;

    // layer 25: the other nodes (icon, then frame), a socket's frame and its jewel
    const jewels = jewelsById();
    for (const { n, s, on } of nodes) {
      if (s.under) continue;
      drawSprite(cx, art, on ? s.baseOn : s.baseOff, n.x, n.y);
      drawSprite(cx, art, on ? s.frameOn : s.frameOff, n.x, n.y);
      const j = jewels.get(n.id);
      if (j && j[1]) {
        const overlay = art.data.named[j[1]];
        if (overlay) drawSprite(cx, art, overlay, n.x, n.y);
      }
    }

    // jewel radius rings (drawJewelRadius), tinted 0.7, drawn still where POB turns them slowly
    cx.globalAlpha = 0.7;
    for (const j of props.jewels) {
      const [, , ring, outer, inner, x, y] = j;
      if (!ring || !inside(c, x, y, outer)) continue;
      const named = art.data.named;
      // POB turns each ring art by `speed × time` (DrawImageRotated), the two of a pair opposite ways; drawn still, at
      // a fixed time, so they lie apart as POB's usually do rather than on top of each other
      const turned = (name: string, size: number, speed: number) => {
        const sprite = named[name];
        if (!sprite || !size) return;
        cx.save();
        cx.translate(x, y);
        cx.rotate(speed * RING_TIME);
        drawSized(cx, art, sprite, 0, 0, size * 2, size * 2);
        cx.restore();
      };
      if (ring === "impossible") {
        turned("jewelShadedOuterRing", outer, -0.8);
        turned("jewelShadedOuterRingFlipped", outer, 1);
        turned("jewelShadedInnerRing", inner, -1.2);
        turned("jewelShadedInnerRingFlipped", inner, 1);
      } else if (ring === "shaded") {
        turned("jewelShadedOuterRing", outer, -0.7);
        turned("jewelShadedOuterRingFlipped", outer, 0.7);
        turned("jewelShadedInnerRing", inner, -0.7);
        turned("jewelShadedInnerRingFlipped", inner, 0.7);
      } else {
        turned(`${ring}1`, outer, -0.7);
        turned(`${ring}2`, outer, 0.7);
      }
    }
    cx.globalAlpha = 1;
  };

  const jewelsById = () => new Map(props.jewels.map((j) => [j[0], j] as const));

  // without POB's art (until it has loaded): lines, arcs and circles
  const drawPlain = (cx: CanvasRenderingContext2D, m: TreeModel, c: Rect) => {
    const alloc = props.alloc;
    const on: Edge[] = [];
    const off: Edge[] = [];
    for (const e of m.edges) {
      const ex = e.arc ? e.cx : (e.x1 + e.x2) / 2;
      const ey = e.arc ? e.cy : (e.y1 + e.y2) / 2;
      const er = e.arc ? e.r : Math.hypot(e.x2 - e.x1, e.y2 - e.y1) / 2;
      if (inside(c, ex, ey, er)) (alloc.has(e.a) && alloc.has(e.b) ? on : off).push(e);
    }
    for (const [list, colour, w] of [
      [off, token("muted-foreground"), width(1.5, 8)],
      [on, token("primary"), width(2, 14)],
    ] as const) {
      if (!list.length) continue;
      cx.beginPath();
      for (const e of list) edgePath(cx, e);
      cx.strokeStyle = colour;
      cx.lineWidth = w;
      cx.stroke();
    }
    const nodes = m.nodes.filter((n) => n.kind !== "classStart" && n.kind !== "ascStart" && inside(c, n.x, n.y, n.r));
    for (const lit of [false, true]) {
      const list = nodes.filter((n) => alloc.has(n.id) === lit);
      if (!list.length) continue;
      circles(cx, list);
      cx.fillStyle = lit ? token("primary") : token("card");
      cx.fill();
      cx.strokeStyle = lit ? token("primary") : token("muted-foreground");
      cx.lineWidth = width(1, 4);
      cx.stroke();
    }
  };

  // what moves under the pointer, as POB shows it: the path a click would take (Intermediate connectors, the nodes in
  // their "can allocate" art), the hovered node drawn as allocated, the nodes a click would free in red, a hovered
  // socket's radii; search matches ringed
  const drawMarks = (cx: CanvasRenderingContext2D) => {
    const m = props.model;
    if (!m) return;
    const art = props.art;
    const matches = props.matches;
    const hovered = props.hovered;
    const alloc = props.alloc;
    cx.translate(panX, panY);
    cx.scale(scale, scale);
    cx.lineCap = "round";

    const path = new Set(props.hoverPath);
    if (path.size && hovered !== null) {
      // getState: Intermediate where both ends are allocated, hovered or on the path (and not both allocated)
      const lit = (id: number) => alloc.has(id) || id === hovered || path.has(id);
      const plainEdges: Edge[] = [];
      for (const id of [...path, hovered]) {
        const n = m.byId.get(id);
        if (!n) continue;
        for (const e of m.edges) {
          if (e.a !== id && e.b !== id) continue;
          if (!lit(e.a) || !lit(e.b) || (alloc.has(e.a) && alloc.has(e.b))) continue;
          const list = art?.byPair.get(edgeKey(e.a, e.b));
          if (art && list?.length) for (const k of list) drawConnector(cx, art, k, 1);
          else plainEdges.push(e);
        }
      }
      if (plainEdges.length) {
        cx.beginPath();
        for (const e of plainEdges) edgePath(cx, e);
        cx.strokeStyle = token("primary");
        cx.lineWidth = width(2, 14);
        cx.stroke();
      }
      const plainNodes: PlacedNode[] = [];
      for (const id of path) {
        const n = m.byId.get(id);
        const s = art?.byNode.get(id);
        if (!n || id === hovered || alloc.has(id)) continue;
        if (!art || !s) {
          plainNodes.push(n);
          continue;
        }
        drawSprite(cx, art, s.basePath, n.x, n.y);
        drawSprite(cx, art, s.framePath, n.x, n.y);
      }
      if (plainNodes.length) {
        circles(cx, plainNodes, 6);
        cx.strokeStyle = token("primary");
        cx.lineWidth = width(1.5, 6);
        cx.stroke();
      }
    }

    // the nodes a click would free: POB turns them and their connectors red
    if (props.hoverDepends.length) {
      const set = new Set(props.hoverDepends);
      cx.beginPath();
      for (const e of m.edges) if (set.has(e.a) && set.has(e.b)) edgePath(cx, e);
      cx.strokeStyle = token("destructive");
      cx.globalAlpha = 0.7;
      cx.lineWidth = width(2, 12);
      cx.stroke();
      circles(
        cx,
        props.hoverDepends.map((id) => m.byId.get(id)).filter((n): n is PlacedNode => !!n),
        4,
      );
      cx.lineWidth = width(1.5, 8);
      cx.stroke();
      cx.globalAlpha = 1;
    }

    const h = hovered !== null ? m.byId.get(hovered) : undefined;
    if (h) {
      const s = art?.byNode.get(h.id);
      if (art && s && h.kind !== "classStart" && h.kind !== "ascStart") {
        const on = alloc.has(h.id);
        drawSprite(cx, art, on ? s.baseOn : s.baseHover, h.x, h.y);
        drawSprite(cx, art, s.frameOn, h.x, h.y);
        const j = jewelsById().get(h.id);
        const overlay = j && j[1] ? art.data.named[j[1]] : 0;
        if (overlay) drawSprite(cx, art, overlay, h.x, h.y);
      } else if (!art || !s) {
        circles(cx, [h], 14);
        cx.strokeStyle = token("foreground");
        cx.lineWidth = width(2, 4);
        cx.stroke();
      }
      // a hovered socket shows the jewel radii, in POB's colours (data, not the app's)
      if (h.kind === "jewel" && art) {
        for (const [outer, inner, colour] of art.data.radii) {
          if (inner !== 0) continue;
          cx.beginPath();
          cx.arc(h.x, h.y, outer, 0, TAU);
          cx.strokeStyle = colour.replace(/^\^x/, "#");
          cx.lineWidth = width(1.5, 6);
          cx.stroke();
        }
      }
    }

    if (matches.size) {
      // a ring that stays visible zoomed out
      cx.beginPath();
      for (const id of matches) {
        const n = m.byId.get(id);
        if (!n) continue;
        const r = n.r * 1.6 + 30;
        cx.moveTo(n.x + r, n.y);
        cx.arc(n.x, n.y, r, 0, TAU);
      }
      cx.strokeStyle = token("warning");
      cx.lineWidth = width(2.5, 10);
      cx.stroke();
    }
  };

  const hoveredNode = () => (props.hovered !== null ? props.model?.byId.get(props.hovered) : undefined);

  /** The hovered node's box on screen (POB's `node.size` across), following the view. */
  const anchorBox = (n: PlacedNode) => {
    viewTick();
    const r = Math.max(4, n.r * view.s);
    return { left: n.x * view.s + view.x - r, top: n.y * view.s + view.y - r, width: r * 2, height: r * 2 };
  };

  return (
    <View class="relative flex-1 overflow-hidden bg-background">
      <Canvas
        accessibilityLabel={tt("treeLabel")}
        accessibilityHint={tt("treeHint")}
        focusable
        captureKeys={["left", "right", "up", "down"]}
        onKeyDown={(e) => onKey(e.key)}
        pan={{ x: panX, y: panY }}
        onPanStart={() => {
          dragging = true;
          props.onHover(null);
        }}
        onPanEnd={(e) => {
          dragging = false;
          setView(e.value?.x ?? view.x, e.value?.y ?? view.y, view.s);
        }}
        onWheel={(e) => {
          if (e.deltaMode === "lines") zoomAbout(e.position.x, e.position.y, Math.pow(1.15, -e.delta.y));
          else if (e.modifiers.control || e.modifiers.platform) zoomAbout(e.position.x, e.position.y, Math.exp(-e.delta.y * 0.01));
          else setView(view.x - e.delta.x, view.y - e.delta.y, view.s);
          hover(e.position);
        }}
        onPinch={(e) => zoomAbout(e.position.x, e.position.y, 1 + e.delta)}
        onMouseMove={(e) => {
          if (e.pressedButton) return;
          hover(e.position);
        }}
        onMouseLeave={() => props.onHover(null)}
        onPress={(e) => {
          const m = props.model;
          if (!m || dragging) return;
          const t = toTree(e.position);
          const n = nodeAt(m, t.x, t.y);
          if (n) props.onPick(n.id);
        }}
        onLayout={({ bounds }) => {
          size = { width: bounds.size.width, height: bounds.size.height };
          canvasSize.set(size);
          recull();
        }}
        style={{ cursor: props.hovered !== null ? "pointer" : "grab" }}
        class="absolute inset-0 focus-visible:border-2 focus-visible:border-ring"
        draw={(cx, area) => {
          size = { width: area.width, height: area.height };
          // a newly loaded tree (not a change of the same tree) fits the view; a chosen search result comes into view
          const m = props.model;
          if (m && fitted !== m.key.split(":")[0]) openView();
          const f = props.focus;
          if (f && f.seq !== focused) {
            focused = f.seq;
            centre(f.id);
          }
          drawTree(cx);
        }}
      />
      <Canvas class="absolute inset-0" style={{ pointerEvents: "none" }} accessibilityElementsHidden draw={(cx) => drawMarks(cx)} />

      <View class="absolute top-2.5 right-2.5 gap-1">
        <ZoomButton label="+" a11y="zoomIn" onPress={() => zoomButtons("in")} />
        <ZoomButton label="−" a11y="zoomOut" onPress={() => zoomButtons("out")} />
        <ZoomButton label={tt("fit")} a11y="fitTree" onPress={fit} />
      </View>

      {/* POB's node tooltip, on the window's layer (never clipped by the tree view): an anchor over the hovered node,
          the tooltip to its right and below as POB has it, on the other side or against the window's edge without room */}
      <If when={hoveredNode()}>
        {(n) => (
          <View
            role="none"
            class="absolute"
            style={{ pointerEvents: "none", ...anchorBox(n()) }}
            tooltip={
              <Peek open placement="right" align="start" class="max-w-[520px] overflow-hidden">
                <NodeTip
                  node={n()}
                  lines={props.tip}
                  maxHeight={Math.max(240, canvasSize().height)}
                  action={props.action}
                  allocated={props.alloc.has(n().id)}
                />
              </Peek>
            }
          />
        )}
      </If>
    </View>
  );
}

function ZoomButton(props: { label: string; a11y: TreeKey; onPress: () => void }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      class="min-w-8 bg-card"
      label={props.label}
      accessibilityLabel={tt(props.a11y)}
      tooltip={tt(props.a11y)}
      onPress={props.onPress}
    />
  );
}

const KIND_LABEL: Record<NodeKind, string> = {
  normal: "Passive",
  notable: "Notable",
  keystone: "Keystone",
  mastery: "Mastery",
  jewel: "Jewel Socket",
  ascStart: "Ascendancy",
  classStart: "Class",
};

/** POB's tooltip lines worth showing here: its keyboard and mouse tips are about POB's own window. */
function shownLines(lines: TipLine[]): TipLine[] {
  const out = lines.filter((l) => l.sep || !/^\s*Tip:/.test(plain(l.text ?? "")));
  // the title is drawn as the header; empty lines and rules at either end go
  let a = 1;
  let b = out.length;
  while (a < b && (out[a]!.sep || !plain(out[a]!.text ?? "").trim())) a++;
  while (b > a && (out[b - 1]!.sep || !plain(out[b - 1]!.text ?? "").trim())) b--;
  return out.slice(a, b);
}

const sizeClass = (size: number | undefined) => ((size ?? 16) <= 14 ? "text-xs" : "text-sm");

// The node's name, POB's tooltip lines (its stats and what allocating it changes), and what a click does; it follows
// the pointer and turns away from the edges it would cross
function NodeTip(props: {
  node: PlacedNode;
  lines: TipLine[] | undefined;
  /** The most it may take: a longer tooltip keeps its start and is set smaller, then cut at the end. */
  maxHeight: number;
  action: string;
  allocated: boolean;
}) {
  // POB's lines take about 18 points each: past the room, the small size
  const dense = () => (shownLines(props.lines ?? []).length + 4) * 18 > props.maxHeight;
  return (
    <View role="none" class="overflow-hidden" style={{ maxHeight: props.maxHeight }}>
      <View class="gap-0.5 border-b border-border px-3 py-2">
        <Text variant="heading" tone={props.allocated ? "primary" : "default"}>
          {tr(props.node.name) || "N/A"}
        </Text>
        <Text variant="caption" tone="muted">
          {tr(KIND_LABEL[props.node.kind])}
          {props.allocated ? ` · ${tt("allocated")}` : ""}
        </Text>
      </View>
      <View class="px-3 py-2">
        <If
          when={props.lines}
          else={
            <Text variant="caption" tone="muted">
              {tt("calculating")}
            </Text>
          }
        >
          {(lines) => <TipLines lines={shownLines(lines())} />}
        </If>
      </View>
      <If when={props.action}>
        <View class="border-t border-border px-3 py-1.5">
          <Text variant="caption" tone="muted">
            {props.action}
          </Text>
        </View>
      </If>
    </View>
  );
}
