/* Generated from spec/schemas. Do not edit directly. */

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
export type Semantic = Semantic1 & {
  type: 'UGPSemanticSelector';
  entityRef?: EntityReference;
  semanticType?: string;
  nodeId?: string;
  extensions?: Extensions;
};
export type Semantic1 =
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
    };

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
