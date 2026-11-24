// The passive tree's artwork as Path of Building draws it (service/tree.lua `art`, after PassiveTreeView:Draw and
// DrawAsset): POB's own image files from its TreeData folder, the sprites in them, and which sprite each node shows in
// each state. Kept once per tree (and cluster jewel layout); the canvas loads each image file once.
import type { CanvasRenderingContext2D } from "nsh";
import { pob } from "../../session";
import { edgeKey } from "./model";

/** `[image, u0, v0, u1, v1, w, h]`: the part of image `image` (1-based), as fractions, and its size in POB's art pixels. */
type Sprite = [number, number, number, number, number, number, number];

type NodeArt = {
  id: number[];
  baseOn: number[];
  basePath: number[];
  baseOff: number[];
  baseHover: number[];
  frameOn: number[];
  framePath: number[];
  frameOff: number[];
  effect: number[];
  under: number[];
};

/** A connector (tree.lua `art`): `[a, b, kind, …Normal quad, …Active quad, set?]` (`set`: PoE2's art set); kind 0 a line (one quad), n an arc of
 * orbit n. A quad is `ox, oy, ux, uy, vx, vy, t`: texture (u, v) lies at origin + u·U + v·V; a line repeats its
 * texture t times along U, an arc shows the kite (origin + U + V, origin + V·t, origin, origin + U·t). */
export type Connector = number[];

export type ArtData = {
  key: string;
  root: string;
  images: { path: string; w: number; h: number; absolute?: boolean }[];
  sprites: Sprite[];
  /** DrawAsset's scale of a sprite's size, each side of its centre: PoE2's 1 (1.33, ART_SCALE, when not given). */
  artScale?: number;
  background: number;
  /** `[classId, sprite, x, y, ascendancy?, angle?]`: the class background art, drawn for the build's class. PoE2's
   * say whose: "" always, an ascendancy id only for it, "*" when none of the class's ascendancies is chosen; `angle`
   * turns it (radians) about its centre. */
  classArt: [number, number, number, number, string?, number?][];
  /** `[x, y, sprite, half, ascendancy]` (ascendancy: 1-based index into `asc`, 0 for none). */
  groups: [number, number, number, number, number][];
  asc: { id: string }[];
  nodes: NodeArt;
  connectors: Connector[];
  /** The connector art by kind (0: LineConnector, n: Orbit n; PoE2: set × 10 + kind): `[Normal, Intermediate, Active]`. */
  connArt: [number, number, number][];
  /** Art drawn for what the build holds: socketed jewels (POB's asset names) and the radius rings. */
  named: Record<string, number>;
  /** The radii a hovered socket shows: `[outer, inner, POB colour code]`. */
  radii: [number, number, string][];
};

/** One node's sprites (0: none). `effect` < 0: drawn only while allocated; `under`: drawn under the connectors. */
export type NodeSprites = {
  baseOn: number;
  basePath: number;
  baseOff: number;
  baseHover: number;
  frameOn: number;
  framePath: number;
  frameOff: number;
  effect: number;
  under: boolean;
};

export type Art = {
  data: ArtData;
  urls: string[];
  byNode: Map<number, NodeSprites>;
  /** The connectors between two nodes (edgeKey), for the path a click would take. */
  byPair: Map<string, Connector[]>;
  /** A group's ascendancy id. */
  groupAsc: (g: ArtData["groups"][number]) => string | undefined;
};

/** PassiveTreeView:DrawAsset's scale: art pixels to tree units (each side of the centre). */
export const ART_SCALE = 1.33;

export function makeArt(data: ArtData): Art {
  const urls = data.images.map((i) => (i.absolute ? i.path : `${data.root}/${i.path}`));
  const byNode = new Map<number, NodeSprites>();
  const n = data.nodes;
  n.id.forEach((id, i) => {
    byNode.set(id, {
      baseOn: n.baseOn[i]!,
      basePath: n.basePath[i]!,
      baseOff: n.baseOff[i]!,
      baseHover: n.baseHover[i]!,
      frameOn: n.frameOn[i]!,
      framePath: n.framePath[i]!,
      frameOff: n.frameOff[i]!,
      effect: n.effect[i]!,
      under: n.under[i] === 1,
    });
  });
  const byPair = new Map<string, Connector[]>();
  for (const c of data.connectors) {
    const k = edgeKey(c[0]!, c[1]!);
    const list = byPair.get(k);
    if (list) list.push(c);
    else byPair.set(k, [c]);
  }
  return { data, urls, byNode, byPair, groupAsc: (g) => (g[4] ? data.asc[g[4] - 1]?.id : undefined) };
}

const arts = new Map<string, Promise<Art>>();

/** The art of the active tree with cluster jewel layout `key`, read from POB once. */
export function loadArt(key: string): Promise<Art> {
  let a = arts.get(key);
  if (!a) {
    a = pob<ArtData>("tree.art").then(makeArt);
    a.catch(() => arts.delete(key));
    arts.set(key, a);
  }
  return a;
}

/** A sprite's half width and height in tree units. */
export function spriteExtent(art: Art, s: number): { hw: number; hh: number } | undefined {
  const sp = art.data.sprites[s - 1];
  const k = art.data.artScale ?? ART_SCALE;
  return sp ? { hw: sp[5] * k, hh: sp[6] * k } : undefined;
}

/** Draws sprite `s` centred on (`x`, `y`), as DrawAsset does; `half`: the top half as given and the bottom mirrored
 * (DrawAsset's isHalf). Whether it drew. */
export function drawSprite(cx: CanvasRenderingContext2D, art: Art, s: number, x: number, y: number, half = false): boolean {
  const sp = art.data.sprites[s - 1];
  if (!sp) return false;
  const img = art.data.images[sp[0] - 1];
  const url = art.urls[sp[0] - 1];
  if (!img || !url) return false;
  const sx = sp[1] * img.w;
  const sy = sp[2] * img.h;
  const sw = (sp[3] - sp[1]) * img.w;
  const sh = (sp[4] - sp[2]) * img.h;
  const k = art.data.artScale ?? ART_SCALE;
  const hw = sp[5] * k;
  const hh = sp[6] * k;
  if (half) {
    cx.drawImage(url, sx, sy, sw, sh, x - hw, y - hh * 2, hw * 2, hh * 2);
    cx.save();
    cx.translate(x, y);
    cx.scale(1, -1);
    cx.drawImage(url, sx, sy, sw, sh, -hw, -hh * 2, hw * 2, hh * 2);
    cx.restore();
  } else {
    cx.drawImage(url, sx, sy, sw, sh, x - hw, y - hh, hw * 2, hh * 2);
  }
  return true;
}

/** Draws sprite `s` `w` × `h` tree units, centred on (`x`, `y`) (PassiveTreeView's DrawImage of a ring). */
export function drawSized(cx: CanvasRenderingContext2D, art: Art, s: number, x: number, y: number, w: number, h: number) {
  const src = source(art, s);
  if (src) cx.drawImage(src.url, src.sx, src.sy, src.sw, src.sh, x - w / 2, y - h / 2, w, h);
}

function source(art: Art, s: number) {
  const sp = art.data.sprites[s - 1];
  const img = sp && art.data.images[sp[0] - 1];
  const url = sp && art.urls[sp[0] - 1];
  if (!sp || !img || !url) return undefined;
  return { url, sx: sp[1] * img.w, sy: sp[2] * img.h, sw: (sp[3] - sp[1]) * img.w, sh: (sp[4] - sp[2]) * img.h };
}

/** Where a connector lies: a centre and a reach, in tree units, for culling. */
export function connectorBounds(c: Connector): { x: number; y: number; r: number } {
  const [ox, oy, ux, uy, vx, vy, t] = c.slice(3, 10) as [number, number, number, number, number, number, number];
  if (c[2] === 0) return { x: ox + (ux * t + vx) / 2, y: oy + (uy * t + vy) / 2, r: Math.hypot(ux, uy) * t * 0.5 + Math.hypot(vx, vy) };
  return { x: ox + (ux + vx) / 2, y: oy + (uy + vy) / 2, r: Math.hypot(ux, uy) + Math.hypot(vx, vy) };
}

export type ConnectorState = 0 | 1 | 2;

/** Draws connector `c` in `state` (0 Normal, 1 Intermediate, 2 Active) as renderConnector does: its art mapped on
 * POB's quad. Whether it drew. */
export function drawConnector(cx: CanvasRenderingContext2D, art: Art, c: Connector, state: ConnectorState): boolean {
  const kind = c[2]!;
  // PoE2's art set follows the quads: one for a line, two for an arc
  const set = c[kind === 0 ? 10 : 17] ?? 0;
  const sprite = art.data.connArt[set * 10 + kind]?.[state];
  const src = sprite ? source(art, sprite) : undefined;
  if (!src) return false;
  const at = kind > 0 && state === 2 && c.length >= 17 ? 10 : 3;
  const [ox, oy, ux, uy, vx, vy, t] = c.slice(at, at + 7) as [number, number, number, number, number, number, number];
  // texture pixels to tree units (the old host's ImageAffine): the image is drawn at its own pixel size, mapped by
  // the transform, so the renderer samples it as the screen shows it
  const { sw, sh } = src;
  cx.save();
  if (kind === 0) {
    cx.transform(ux / sw, uy / sw, vx / sh, vy / sh, ox, oy);
    // the texture repeats along the line
    for (let k = 0; k < t; k++) {
      const part = Math.min(1, t - k);
      cx.drawImage(src.url, src.sx, src.sy, sw * part, sh, k * sw, 0, sw * part, sh);
    }
  } else {
    if (t < 1) {
      // only the kite of the arc texture
      cx.beginPath();
      cx.moveTo(ox + ux + vx, oy + uy + vy);
      cx.lineTo(ox + vx * t, oy + vy * t);
      cx.lineTo(ox, oy);
      cx.lineTo(ox + ux * t, oy + uy * t);
      cx.closePath();
      cx.clip();
    }
    cx.transform(ux / sw, uy / sw, vx / sh, vy / sh, ox, oy);
    cx.drawImage(src.url, src.sx, src.sy, sw, sh, 0, 0, sw, sh);
  }
  cx.restore();
  return true;
}
