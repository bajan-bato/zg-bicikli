import { toX, toY } from '../../utils/geo.js';
import type { RoutingGraph, Snap } from './graph.js';

/** Dio rute: brid i interval duž njega (fromAlong > toAlong znači vožnju unatrag). */
export interface PathPiece {
  edge: number;
  fromAlong: number;
  toAlong: number;
}

/** Cijena prolaska cijelim bridom za odabrani način usmjeravanja. */
export type EdgeCost = (edgeIndex: number) => number;

/** Binarna min-gomila parova (prioritet, vrh). */
class MinHeap {
  private prio: number[] = [];
  private val: number[] = [];

  get size(): number {
    return this.val.length;
  }

  push(p: number, v: number): void {
    const { prio, val } = this;
    let i = val.length;
    prio.push(p);
    val.push(v);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (prio[parent] <= p) break;
      prio[i] = prio[parent];
      val[i] = val[parent];
      i = parent;
    }
    prio[i] = p;
    val[i] = v;
  }

  pop(): number {
    const { prio, val } = this;
    const top = val[0];
    const lastP = prio.pop()!;
    const lastV = val.pop()!;
    const n = val.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && prio[r] < prio[l] ? r : l;
        if (prio[c] >= lastP) break;
        prio[i] = prio[c];
        val[i] = val[c];
        i = c;
      }
      prio[i] = lastP;
      val[i] = lastV;
    }
    return top;
  }
}

interface VirtualArc {
  to: number;
  cost: number;
  piece: PathPiece;
}

/**
 * A* nad usmjerenim težinskim grafom. Polazište i odredište su virtualni vrhovi
 * na projekcijama točaka na najbliže bridove, tako da ruta počinje i završava
 * točno na mreži, a ne na najbližem raskrižju.
 *
 * Heuristika je zračna udaljenost do odredišta. Dopustiva je jer je najmanja
 * cijena po metru u oba načina jednaka 1 (najkraća ruta / dionica sa stazom).
 */
export function astar(graph: RoutingGraph, start: Snap, end: Snap, edgeCost: EdgeCost): PathPiece[] | null {
  const V = graph.vertexCount;
  const S = V;
  const T = V + 1;
  const n = V + 2;
  const sEdge = graph.edges[start.edge];
  const tEdge = graph.edges[end.edge];

  const partial = (ei: number, a: number, b: number): number => {
    const e = graph.edges[ei];
    return e.length === 0 ? 0 : (edgeCost(ei) * Math.abs(b - a)) / e.length;
  };

  // Lukovi iz virtualnog polazišta.
  const fromStart: VirtualArc[] = [];
  if (sEdge.backward) fromStart.push({ to: sEdge.from, cost: partial(start.edge, start.along, 0), piece: { edge: start.edge, fromAlong: start.along, toAlong: 0 } });
  if (sEdge.forward) fromStart.push({ to: sEdge.to, cost: partial(start.edge, start.along, sEdge.length), piece: { edge: start.edge, fromAlong: start.along, toAlong: sEdge.length } });
  if (start.edge === end.edge) {
    const fwd = end.along >= start.along;
    if ((fwd && sEdge.forward) || (!fwd && sEdge.backward)) {
      fromStart.push({ to: T, cost: partial(start.edge, start.along, end.along), piece: { edge: start.edge, fromAlong: start.along, toAlong: end.along } });
    }
  }
  // Lukovi prema virtualnom odredištu.
  const intoEnd = new Map<number, VirtualArc[]>();
  const addInto = (v: number, arc: VirtualArc) => {
    const list = intoEnd.get(v);
    if (list) list.push(arc);
    else intoEnd.set(v, [arc]);
  };
  if (tEdge.forward) addInto(tEdge.from, { to: T, cost: partial(end.edge, 0, end.along), piece: { edge: end.edge, fromAlong: 0, toAlong: end.along } });
  if (tEdge.backward) addInto(tEdge.to, { to: T, cost: partial(end.edge, tEdge.length, end.along), piece: { edge: end.edge, fromAlong: tEdge.length, toAlong: end.along } });

  const g = new Float64Array(n).fill(Infinity);
  const closed = new Uint8Array(n);
  const prev = new Int32Array(n).fill(-1);
  /** Referenca brida (edge*2+smjer) kojim se stiglo u vrh, ili -1 za virtualni luk. */
  const prevRef = new Int32Array(n).fill(-1);
  const prevPiece = new Map<number, PathPiece>();

  const tx = toX(end.lon);
  const ty = toY(end.lat);
  const h = (v: number): number =>
    v >= V ? 0 : Math.hypot(toX(graph.vertexLon[v]) - tx, toY(graph.vertexLat[v]) - ty);

  const heap = new MinHeap();
  g[S] = 0;
  heap.push(h(S), S);

  const relax = (u: number, v: number, cost: number, ref: number, piece: PathPiece | null) => {
    const ng = g[u] + cost;
    if (ng < g[v]) {
      g[v] = ng;
      prev[v] = u;
      prevRef[v] = ref;
      if (piece) prevPiece.set(v, piece);
      else prevPiece.delete(v);
      heap.push(ng + h(v), v);
    }
  };

  while (heap.size > 0) {
    const u = heap.pop();
    if (closed[u]) continue;
    closed[u] = 1;
    if (u === T) break;

    if (u === S) {
      for (const arc of fromStart) relax(S, arc.to, arc.cost, -1, arc.piece);
      continue;
    }
    for (const ref of graph.adjacency[u]) {
      const ei = ref >> 1;
      const e = graph.edges[ei];
      const v = ref & 1 ? e.from : e.to;
      if (!closed[v]) relax(u, v, edgeCost(ei), ref, null);
    }
    const arcs = intoEnd.get(u);
    if (arcs) for (const arc of arcs) relax(u, T, arc.cost, -1, arc.piece);
  }

  if (!Number.isFinite(g[T])) return null;

  const pieces: PathPiece[] = [];
  for (let v = T; v !== S; v = prev[v]) {
    const piece = prevPiece.get(v);
    if (piece) pieces.push(piece);
    else {
      const ref = prevRef[v];
      const e = graph.edges[ref >> 1];
      pieces.push(ref & 1 ? { edge: ref >> 1, fromAlong: e.length, toAlong: 0 } : { edge: ref >> 1, fromAlong: 0, toAlong: e.length });
    }
  }
  return pieces.reverse().filter((p) => Math.abs(p.toAlong - p.fromAlong) > 1e-6);
}
