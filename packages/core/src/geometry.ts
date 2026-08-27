export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Polygon {
  points: readonly Point[];
}

export type Geometry = Point | Rect | Polygon;

export type Transform2D = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
];

const epsilon = 1e-9;

export function isPoint(geometry: Geometry): geometry is Point {
  return 'x' in geometry && 'y' in geometry && !('width' in geometry);
}

export function isRect(geometry: Geometry): geometry is Rect {
  return 'width' in geometry && 'height' in geometry;
}

export function normalizeRect(rect: Rect): Rect {
  return {
    x: rect.width < 0 ? rect.x + rect.width : rect.x,
    y: rect.height < 0 ? rect.y + rect.height : rect.y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

export function pointInRect(point: Point, input: Rect): boolean {
  const rect = normalizeRect(input);
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  const cross =
    (point.y - start.y) * (end.x - start.x) -
    (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > epsilon) return false;
  const dot =
    (point.x - start.x) * (end.x - start.x) +
    (point.y - start.y) * (end.y - start.y);
  if (dot < -epsilon) return false;
  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= lengthSquared + epsilon;
}

export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  if (polygon.points.length < 3) return false;
  let inside = false;
  for (
    let index = 0, previous = polygon.points.length - 1;
    index < polygon.points.length;
    previous = index++
  ) {
    const currentPoint = polygon.points[index]!;
    const previousPoint = polygon.points[previous]!;
    if (pointOnSegment(point, previousPoint, currentPoint)) return true;
    const intersectsRay =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (intersectsRay) inside = !inside;
  }
  return inside;
}

export function rectIntersection(
  firstInput: Rect,
  secondInput: Rect,
): Rect | undefined {
  const first = normalizeRect(firstInput);
  const second = normalizeRect(secondInput);
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  if (right < x || bottom < y) return undefined;
  return { x, y, width: right - x, height: bottom - y };
}

export function rectArea(rect: Rect): number {
  const normalized = normalizeRect(rect);
  return normalized.width * normalized.height;
}

export function visibleRatio(target: Rect, clip: Rect): number {
  const area = rectArea(target);
  if (area === 0) {
    return pointInRect({ x: target.x, y: target.y }, clip) ? 1 : 0;
  }
  const intersection = rectIntersection(target, clip);
  return intersection ? rectArea(intersection) / area : 0;
}

function orientation(first: Point, second: Point, third: Point): number {
  const value =
    (second.y - first.y) * (third.x - second.x) -
    (second.x - first.x) * (third.y - second.y);
  return Math.abs(value) < epsilon ? 0 : Math.sign(value);
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && pointOnSegment(c, a, b)) ||
    (o2 === 0 && pointOnSegment(d, a, b)) ||
    (o3 === 0 && pointOnSegment(a, c, d)) ||
    (o4 === 0 && pointOnSegment(b, c, d))
  );
}

export function polygonsIntersect(first: Polygon, second: Polygon): boolean {
  if (first.points.length < 3 || second.points.length < 3) return false;
  for (let firstIndex = 0; firstIndex < first.points.length; firstIndex += 1) {
    const a = first.points[firstIndex]!;
    const b = first.points[(firstIndex + 1) % first.points.length]!;
    for (
      let secondIndex = 0;
      secondIndex < second.points.length;
      secondIndex += 1
    ) {
      const c = second.points[secondIndex]!;
      const d = second.points[(secondIndex + 1) % second.points.length]!;
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return (
    pointInPolygon(first.points[0]!, second) ||
    pointInPolygon(second.points[0]!, first)
  );
}

export function geometryBounds(geometry: Geometry): Rect {
  if (isPoint(geometry)) {
    return { x: geometry.x, y: geometry.y, width: 0, height: 0 };
  }
  if (isRect(geometry)) return normalizeRect(geometry);
  if (geometry.points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const xs = geometry.points.map((point) => point.x);
  const ys = geometry.points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function asPolygon(geometry: Rect | Polygon): Polygon {
  if (!isRect(geometry)) return geometry;
  const rect = normalizeRect(geometry);
  return {
    points: [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ],
  };
}

export function geometriesIntersect(
  first: Geometry,
  second: Geometry,
): boolean {
  if (isPoint(first)) {
    if (isPoint(second)) return first.x === second.x && first.y === second.y;
    return isRect(second)
      ? pointInRect(first, second)
      : pointInPolygon(first, second);
  }
  if (isPoint(second)) return geometriesIntersect(second, first);
  if (isRect(first) && isRect(second)) {
    return rectIntersection(first, second) !== undefined;
  }
  return polygonsIntersect(asPolygon(first), asPolygon(second));
}

export function transformPoint(point: Point, transform: Transform2D): Point {
  const [a, b, c, d, e, f] = transform;
  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  };
}

export function invertTransform(transform: Transform2D): Transform2D {
  const [a, b, c, d, e, f] = transform;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < epsilon) {
    throw new Error('Transform is not invertible');
  }
  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant,
  ];
}

export function clipRect(rect: Rect, clips: readonly Rect[]): Rect | undefined {
  let result = normalizeRect(rect);
  for (const clip of clips) {
    const intersection = rectIntersection(result, clip);
    if (!intersection) return undefined;
    result = intersection;
  }
  return result;
}
