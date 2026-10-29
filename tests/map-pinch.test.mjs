import test from 'node:test';
import assert from 'node:assert/strict';
import { pinchFrame } from '../lib/map-pinch.mjs';

test('双指缩放围绕中点并支持同时平移', () => {
  const result = pinchFrame({
    startDistance: 100,
    distance: 150,
    startZoom: 80,
    anchor: { x: 2, y: 1 },
    midpoint: { x: 140, y: 200 },
    padding: { x: 390, y: 800 },
  });
  assert.deepEqual(result, { zoom: 120, left: 490, top: 720 });
});

test('双指缩放限制地图尺寸', () => {
  const base = {
    startDistance: 100,
    startZoom: 80,
    anchor: { x: 0, y: 0 },
    midpoint: { x: 0, y: 0 },
    padding: { x: 0, y: 0 },
  };
  assert.equal(pinchFrame({ ...base, distance: 1 }).zoom, 4);
  assert.equal(pinchFrame({ ...base, distance: 1000 }).zoom, 155);
});
