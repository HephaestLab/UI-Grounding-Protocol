/* Generated from spec/schemas. Do not edit directly. */

export type Anchor = Dom | Text | Svg1 | Canvas | Virtual | Accessibility;
export type Selector =
  | Css
  | Xpath
  | TextQuote
  | TextPosition
  | Range
  | Svg
  | Fragment
  | Geometry
  | Semantic;
export type Semantic = (
  | {
      entityRef: unknown;
      [k: string]: unknown;
    }
  | {
      semanticType: unknown;
      [k: string]: unknown;
    }
  | {
      nodeId: unknown;
      [k: string]: unknown;
    }
) & {
  type: 'UGPSemanticSelector';
  entityRef?: EntityReference;
  semanticType?: string;
  nodeId?: string;
  extensions?: Extensions;
};

export interface Dom {
  anchorId: string;
  nodeId: string;
  kind: 'dom';
  surfaceRevision: string;
  priority?: number;
  visibility?: 'visible' | 'occluded' | 'offscreen' | 'unknown';
  selector: Selector;
  geometry?: Point | Rect | Polygon;
  extensions?: Extensions;
}
export interface Css {
  type: 'CssSelector';
  value: string;
  extensions?: Extensions;
}
export interface Extensions {
  [k: string]: unknown;
}
export interface Xpath {
  type: 'XPathSelector';
  value: string;
  extensions?: Extensions;
}
export interface TextQuote {
  type: 'TextQuoteSelector';
  exact: string;
  prefix?: string;
  suffix?: string;
  extensions?: Extensions;
}
export interface TextPosition {
  type: 'TextPositionSelector';
  start: number;
  end: number;
  extensions?: Extensions;
}
export interface Range {
  type: 'RangeSelector';
  startPath: string;
  startOffset: number;
  endPath: string;
  endOffset: number;
  extensions?: Extensions;
}
export interface Svg {
  type: 'SvgSelector';
  value: string;
  extensions?: Extensions;
}
export interface Fragment {
  type: 'FragmentSelector';
  value: string;
  conformsTo?: string;
  extensions?: Extensions;
}
export interface Geometry {
  type: 'UGPGeometrySelector';
  geometry: Point | Rect | Polygon;
  extensions?: Extensions;
}
export interface Point {
  kind: 'point';
  coordinateSpace: 'viewport' | 'surface' | 'anchor';
  x: number;
  y: number;
}
export interface Rect {
  kind: 'rect';
  coordinateSpace: 'viewport' | 'surface' | 'anchor';
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Polygon {
  kind: 'polygon';
  coordinateSpace: 'viewport' | 'surface' | 'anchor';
  /**
   * @minItems 3
   * @maxItems 2048
   */
  points: [
    {
      x: number;
      y: number;
    },
    {
      x: number;
      y: number;
    },
    {
      x: number;
      y: number;
    },
    ...{
      x: number;
      y: number;
    }[],
  ];
}
export interface EntityReference {
  namespace: string;
  id: string;
  type?: string;
  revision?: string;
  extensions?: Extensions;
}
export interface Text {
  anchorId: string;
  nodeId: string;
  kind: 'text';
  surfaceRevision: string;
  priority?: number;
  visibility?: 'visible' | 'occluded' | 'offscreen' | 'unknown';
  /**
   * @minItems 1
   * @maxItems 64
   */
  selectors: [Selector, ...Selector[]];
  geometry?: Point | Rect | Polygon;
  extensions?: Extensions;
}
export interface Svg1 {
  anchorId: string;
  nodeId: string;
  kind: 'svg';
  surfaceRevision: string;
  priority?: number;
  visibility?: 'visible' | 'occluded' | 'offscreen' | 'unknown';
  elementId: string;
  geometry?: Point | Rect | Polygon;
  extensions?: Extensions;
}
export interface Canvas {
  anchorId: string;
  nodeId: string;
  kind: 'canvas';
  surfaceRevision: string;
  priority?: number;
  visibility?: 'visible' | 'occluded' | 'offscreen' | 'unknown';
  adapterId: string;
  adapterRevision?: string;
  geometry: Point | Rect | Polygon;
  expiresAt?: string;
  extensions?: Extensions;
}
export interface Virtual {
  anchorId: string;
  nodeId: string;
  kind: 'virtual';
  surfaceRevision: string;
  priority?: number;
  visibility?: 'visible' | 'occluded' | 'offscreen' | 'unknown';
  itemKey: string;
  geometry?: Point | Rect | Polygon;
  extensions?: Extensions;
}
export interface Accessibility {
  anchorId: string;
  nodeId: string;
  kind: 'accessibility';
  surfaceRevision: string;
  priority?: number;
  visibility?: 'visible' | 'occluded' | 'offscreen' | 'unknown';
  role: string;
  name: string;
  geometry?: Point | Rect | Polygon;
  extensions?: Extensions;
}
