import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  clipRect,
  geometriesIntersect,
  geometryBounds,
  invertTransform,
  isPoint,
  isRect,
  normalizeRect,
  pointInPolygon,
  pointInRect,
  polygonsIntersect,
  rectArea,
  rectIntersection,
  transformPoint,
  visibleRatio,
  type Rect,
} from './geometry.js';

const finite = fc.double({ min: -1e6, max: 1e6, noNaN: true });
const rects = fc.record({
  x: finite,
  y: finite,
  width: finite,
  height: finite,
});

describe('geometry core', () => {
  it('normalizes rectangles idempotently and keeps area non-negative', () => {
    fc.assert(
      fc.property(rects, (rect) => {
        const normalized = normalizeRect(rect);
        expect(normalizeRect(normalized)).toEqual(normalized);
        expect(normalized.width).toBeGreaterThanOrEqual(0);
        expect(normalized.height).toBeGreaterThanOrEqual(0);
        expect(rectArea(rect)).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 10_000, seed: 20_260_827 },
    );
  });

  it('includes rectangle boundaries and handles negative dimensions', () => {
    const rect = { x: 10, y: 20, width: -10, height: -20 };
    expect(normalizeRect(rect)).toEqual({ x: 0, y: 0, width: 10, height: 20 });
    expect(pointInRect({ x: 0, y: 0 }, rect)).toBe(true);
    expect(pointInRect({ x: 10, y: 20 }, rect)).toBe(true);
    expect(pointInRect({ x: 11, y: 20 }, rect)).toBe(false);
  });

  it('computes symmetric rectangle intersections', () => {
    fc.assert(
      fc.property(rects, rects, (first, second) => {
        expect(rectIntersection(first, second)).toEqual(
          rectIntersection(second, first),
        );
      }),
      { numRuns: 10_000, seed: 20_260_827 },
    );
    expect(
      rectIntersection(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: 5, width: 10, height: 10 },
      ),
    ).toEqual({ x: 5, y: 5, width: 5, height: 5 });
    expect(
      rectIntersection(
        { x: 0, y: 0, width: 1, height: 1 },
        { x: 2, y: 2, width: 1, height: 1 },
      ),
    ).toBeUndefined();
  });

  it('computes visible ratios for areas and zero-area points', () => {
    expect(
      visibleRatio(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 0, y: 0, width: 5, height: 10 },
      ),
    ).toBe(0.5);
    expect(
      visibleRatio(
        { x: 2, y: 2, width: 0, height: 0 },
        { x: 0, y: 0, width: 5, height: 5 },
      ),
    ).toBe(1);
    expect(
      visibleRatio(
        { x: 8, y: 8, width: 0, height: 0 },
        { x: 0, y: 0, width: 5, height: 5 },
      ),
    ).toBe(0);
    expect(
      visibleRatio(
        { x: 8, y: 8, width: 2, height: 2 },
        { x: 0, y: 0, width: 5, height: 5 },
      ),
    ).toBe(0);
  });

  it('handles polygon boundaries, containment, crossing, and degeneracy', () => {
    const square = {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 20, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: 0 }, square)).toBe(false);
    expect(pointInPolygon({ x: 0, y: 0 }, { points: [] })).toBe(false);
    expect(
      polygonsIntersect(square, {
        points: [
          { x: 5, y: 5 },
          { x: 6, y: 5 },
          { x: 5, y: 6 },
        ],
      }),
    ).toBe(true);
    expect(
      polygonsIntersect(square, {
        points: [
          { x: 20, y: 20 },
          { x: 21, y: 20 },
          { x: 20, y: 21 },
        ],
      }),
    ).toBe(false);
    expect(polygonsIntersect(square, { points: [] })).toBe(false);
    expect(
      polygonsIntersect(square, {
        points: [
          { x: 10, y: 10 },
          { x: 12, y: 10 },
          { x: 10, y: 12 },
        ],
      }),
    ).toBe(true);
  });

  it('dispatches every geometry intersection combination', () => {
    const point = { x: 1, y: 1 };
    const rect = { x: 0, y: 0, width: 2, height: 2 };
    const polygon = {
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 2 },
      ],
    };
    expect(geometriesIntersect(point, { x: 1, y: 1 })).toBe(true);
    expect(geometriesIntersect(point, { x: 2, y: 2 })).toBe(false);
    expect(geometriesIntersect(point, rect)).toBe(true);
    expect(geometriesIntersect(rect, point)).toBe(true);
    expect(geometriesIntersect(point, polygon)).toBe(true);
    expect(geometriesIntersect(rect, rect)).toBe(true);
    expect(geometriesIntersect(rect, polygon)).toBe(true);
  });

  it('computes bounds and type guards', () => {
    expect(isPoint({ x: 1, y: 2 })).toBe(true);
    expect(isRect({ x: 1, y: 2, width: 3, height: 4 })).toBe(true);
    expect(geometryBounds({ x: 1, y: 2 })).toEqual({
      x: 1,
      y: 2,
      width: 0,
      height: 0,
    });
    expect(geometryBounds({ x: 2, y: 4, width: -2, height: -4 })).toEqual({
      x: 0,
      y: 0,
      width: 2,
      height: 4,
    });
    expect(geometryBounds({ points: [] })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    expect(
      geometryBounds({
        points: [
          { x: -1, y: 5 },
          { x: 3, y: -2 },
          { x: 0, y: 4 },
        ],
      }),
    ).toEqual({ x: -1, y: -2, width: 4, height: 7 });
  });

  it('round-trips invertible affine transforms', () => {
    fc.assert(
      fc.property(finite, finite, (x, y) => {
        const transform = [2, 0.5, -0.25, 3, 10, -20] as const;
        const transformed = transformPoint({ x, y }, transform);
        const restored = transformPoint(
          transformed,
          invertTransform(transform),
        );
        expect(restored.x).toBeCloseTo(x, 6);
        expect(restored.y).toBeCloseTo(y, 6);
      }),
      { numRuns: 10_000, seed: 20_260_827 },
    );
    expect(() => invertTransform([1, 2, 2, 4, 0, 0])).toThrow('not invertible');
  });

  it('clips through multiple ancestors and stops when empty', () => {
    const input: Rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(
      clipRect(input, [
        { x: 10, y: 10, width: 80, height: 80 },
        { x: 20, y: 0, width: 20, height: 100 },
      ]),
    ).toEqual({ x: 20, y: 10, width: 20, height: 80 });
    expect(
      clipRect(input, [
        { x: 200, y: 200, width: 1, height: 1 },
        { x: 0, y: 0, width: 1, height: 1 },
      ]),
    ).toBeUndefined();
    expect(clipRect(input, [])).toEqual(input);
  });
});
