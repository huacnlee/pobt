// The passive tree as the official Path of Building placed it (service/tree.lua `geometry`: Classes/PassiveTree.lua's
// node positions and connectors), kept once per tree version for the page's canvas and its hit tests.
import { pob } from "../../session";

export type NodeKind = "normal" | "notable" | "keystone" | "mastery" | "jewel" | "classStart" | "ascStart";

/** POB's node types, as tree.lua numbers them. */
const KINDS: NodeKind[] = ["normal", "normal", "notable", "keystone", "mastery", "jewel", "classStart", "ascStart"];

export type PlacedNode = {
  id: number;
  kind: NodeKind;
  name: string;
  x: number;
  y: number;
  /** Drawn radius, in tree units (half POB's node art size). */
  r: number;
  /** How near the pointer must be to point at it (POB's `rsq`); 0: never. */
  hit: number;
  /** The ascendancy's id (POB's `ascendancyName`). */
  ascendancy?: string;
};

/** A connection: a straight line, or an arc of the group's orbit (PassiveTree:BuildConnector). */
export type Edge = { a: number; b: number; ascendancy?: string } & (
  | { arc: false; x1: number; y1: number; x2: number; y2: number }
  | { arc: true; cx: number; cy: number; r: number; a0: number; sweep: number }
);

type Columns = { id: number[]; x: number[]; y: number[]; t: number[]; r: number[]; hit: number[]; asc: number[]; name: string[] };
type RawEdge = [number, number] | [number, number, number, number, number, number, number];
export type Ascendancy = { id: string; name: string; class: string };

export type Geometry = {
  key: string;
  nodes: Columns;
  edges: RawEdge[];
  asc: Ascendancy[];
  classes: { id: number; name: string; x?: number; y?: number }[];
  ring: number;
  /** PassiveTree's `size`, the unit of PassiveTreeView's zoom. */
  size: number;
  bounds: [number, number, number, number];
};

/** Cluster jewel nodes, which come and go with the build (tree.lua `read`). */
export type Extra = { nodes: Columns; edges: RawEdge[]; asc: Ascendancy[] };

export type TreeModel = {
  key: string;
  nodes: PlacedNode[];
  byId: Map<number, PlacedNode>;
  edges: Edge[];
  edgeOf: Map<string, Edge>;
  ascendancies: Map<string, Ascendancy>;
  classStarts: { name: string; x: number; y: number }[];
  ring: number;
  size: number;
  bounds: { x0: number; y0: number; x1: number; y1: number };
  grid: Map<number, number[]>;
};

const CELL = 256;
const cellKey = (cx: number, cy: number) => cx * 4096 + cy;
export const edgeKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;

function place(cols: Columns, asc: Ascendancy[]): PlacedNode[] {
  return cols.id.map((id, i) => {
    const kind = KINDS[cols.t[i]] ?? "normal";
    return {
      id,
      kind,
      name: cols.name[i] ?? "",
      x: cols.x[i],
      y: cols.y[i],
      r: kind === "ascStart" ? 22 : cols.r[i],
      hit: cols.hit[i],
      ascendancy: cols.asc[i] ? asc[cols.asc[i] - 1]?.id : undefined,
    };
  });
}

function connect(raw: RawEdge, byId: Map<number, PlacedNode>): Edge | undefined {
  const a = byId.get(raw[0]);
  const b = byId.get(raw[1]);
  if (!a || !b) return undefined;
  if (raw.length === 7) {
    const [, , cx, cy, r, a0, sweep] = raw;
    return { a: a.id, b: b.id, ascendancy: a.ascendancy, arc: true, cx, cy, r, a0, sweep };
  }
  return { a: a.id, b: b.id, ascendancy: a.ascendancy, arc: false, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/** The model of `geo`, with the cluster jewel nodes of `extra`. */
export function buildModel(geo: Geometry, extra: Extra | undefined): TreeModel {
  const nodes = [...place(geo.nodes, geo.asc), ...(extra ? place(extra.nodes, extra.asc) : [])];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: Edge[] = [];
  const edgeOf = new Map<string, Edge>();
  for (const raw of [...geo.edges, ...(extra?.edges ?? [])]) {
    const e = connect(raw, byId);
    if (!e) continue;
    edges.push(e);
    edgeOf.set(edgeKey(e.a, e.b), e);
  }
  const ascendancies = new Map(geo.asc.map((a) => [a.id, a]));
  for (const a of extra?.asc ?? []) if (!ascendancies.has(a.id)) ascendancies.set(a.id, a);
  const classStarts = geo.classes
    .filter((c) => c.x !== undefined && c.y !== undefined)
    .map((c) => ({ name: c.name, x: c.x!, y: c.y! }));
  const grid = new Map<number, number[]>();
  nodes.forEach((n, i) => {
    if (!n.hit) return;
    const k = cellKey(Math.floor(n.x / CELL), Math.floor(n.y / CELL));
    const cell = grid.get(k);
    if (cell) cell.push(i);
    else grid.set(k, [i]);
  });
  const [x0, y0, x1, y1] = geo.bounds;
  return {
    key: `${geo.key}:${extra?.nodes.id.join(",") ?? ""}`,
    nodes,
    byId,
    edges,
    edgeOf,
    ascendancies,
    classStarts,
    ring: geo.ring,
    size: geo.size,
    bounds: { x0: x0 - 200, y0: y0 - 200, x1: x1 + 200, y1: y1 + 200 },
    grid,
  };
}

const geometries = new Map<string, Promise<Geometry>>();

/** The geometry of the active spec's tree, read from POB once per tree version. */
export function loadGeometry(key: string): Promise<Geometry> {
  let g = geometries.get(key);
  if (!g) {
    g = pob<Geometry>("tree.geometry");
    g.catch(() => geometries.delete(key));
    geometries.set(key, g);
  }
  return g;
}

/** The node under (`x`, `y`) in tree units: the nearest within its pointer radius. */
export function nodeAt(m: TreeModel, x: number, y: number): PlacedNode | undefined {
  const reach = 120;
  let best: PlacedNode | undefined;
  let bestD = Infinity;
  for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) {
    for (let cy = Math.floor((y - reach) / CELL); cy <= Math.floor((y + reach) / CELL); cy++) {
      for (const i of m.grid.get(cellKey(cx, cy)) ?? []) {
        const n = m.nodes[i]!;
        const d = Math.hypot(n.x - x, n.y - y);
        if (d <= n.hit && d < bestD) {
          best = n;
          bestD = d;
        }
      }
    }
  }
  return best;
}
