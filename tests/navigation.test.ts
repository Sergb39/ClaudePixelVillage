import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath, nearestOpen } from '../src/client/navigation.js';
test('route goes around a solid cottage footprint without crossing it', () => {
  const blocked = new Set(['3,2', '3,3', '3,4']);
  const path = findPath({ x: 1, y: 3 }, { x: 5, y: 3 }, blocked, 8, 8);
  assert.deepEqual(path.at(-1), { x: 5, y: 3 });
  assert.ok(path.length > 4);
  let previous = { x: 1, y: 3 };
  for (const point of path) { assert.ok(!blocked.has(`${point.x},${point.y}`)); assert.equal(Math.abs(previous.x - point.x) + Math.abs(previous.y - point.y), 1); previous = point; }
});
test('blocked station slots resolve to walkable cells; unreachable targets do not cross walls', () => {
  assert.deepEqual(nearestOpen({ x: 3, y: 3 }, new Set(['3,3']), 8, 8), { x: 4, y: 3 });
  const wall = new Set(Array.from({ length: 6 }, (_, i) => `3,${i + 1}`));
  assert.deepEqual(findPath({ x: 1, y: 3 }, { x: 5, y: 3 }, wall, 8, 8), []);
});
