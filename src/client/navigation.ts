export interface Point { x: number; y: number; }
const key = (p: Point) => `${p.x},${p.y}`;
export function nearestOpen(point: Point, blocked: Set<string>, width: number, height: number): Point {
  const start = { x: Math.max(1, Math.min(width - 2, point.x)), y: Math.max(1, Math.min(height - 2, point.y)) };
  const queue = [start]; const seen = new Set([key(start)]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (!blocked.has(key(p))) return p;
    for (const n of neighbors(p)) {
      if (n.x < 1 || n.x >= width - 1 || n.y < 1 || n.y >= height - 1 || seen.has(key(n))) continue;
      seen.add(key(n)); queue.push(n);
    }
  }
  return start;
}
const neighbors = (p: Point): Point[] => [{ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }];
/** Four-way A*: no diagonal corner cutting through cottages or trees. */
export function findPath(start: Point, goal: Point, blocked: Set<string>, width: number, height: number): Point[] {
  const source = nearestOpen(start, blocked, width, height); const target = nearestOpen(goal, blocked, width, height);
  const end = key(target); const first = key(source);
  const open = new Set([first]); const positions = new Map([[first, source]]); const previous = new Map<string, string>();
  const cost = new Map([[first, 0]]);
  const distance = (p: Point) => Math.abs(p.x - target.x) + Math.abs(p.y - target.y);
  while (open.size) {
    let best = ''; let score = Infinity;
    for (const candidate of open) { const s = (cost.get(candidate) ?? Infinity) + distance(positions.get(candidate)!); if (s < score) { score = s; best = candidate; } }
    if (best === end) {
      const path: Point[] = []; let at = best;
      while (at !== first) { path.push(positions.get(at)!); at = previous.get(at)!; }
      return path.reverse();
    }
    open.delete(best); const p = positions.get(best)!;
    for (const n of neighbors(p)) {
      const k = key(n); if (n.x < 1 || n.x >= width - 1 || n.y < 1 || n.y >= height - 1 || blocked.has(k)) continue;
      const next = cost.get(best)! + 1;
      if (next >= (cost.get(k) ?? Infinity)) continue;
      cost.set(k, next); positions.set(k, n); previous.set(k, best); open.add(k);
    }
  }
  return [];
}
