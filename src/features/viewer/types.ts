export type BoundsMode = 'logical' | 'paint'
export type LayerType = 'group' | 'text' | 'shape' | 'image' | 'smartobject'
export type ViewerTool = 'select' | 'measure' | 'ruler'
export type ViewerLeftTab = 'files' | 'development' | 'layers'
export type ViewerRightTab = 'annotation' | 'assets' | 'properties' | 'diagnostics'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface LayerStyle {
  opacity: number
  blendMode: string
  fill?: string
  fontFamily?: string
  fontPostScriptName?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  letterSpacing?: number
  textAlign?: string
  color?: string
  borderRadius?: number
}

export interface DesignLayer {
  id: string
  name: string
  type: LayerType
  sourceKind?: string
  path?: string
  parentId?: string | null
  order?: number
  bounds: Bounds
  paintBounds?: Bounds
  visible: boolean
  text?: string
  style: LayerStyle
  children?: DesignLayer[]
  assetId?: string
  diagnosticIds?: string[]
}

export interface ViewerAssetFile {
  scale: number
  path: string
}

export interface ViewerAssetPlacement {
  id: string
  nodeId: string
  bounds: Bounds
  logicalBounds?: Bounds
  marker?: string
  mode?: string
  density?: number
  lineageNodeIds: string[]
}

export interface ViewerAsset {
  id: string
  displayName: string
  layerId?: string
  layerIds?: string[]
  marker: string
  name: string
  format: string
  logicalSize: string
  pixelSize: string
  scales: string
  placement: string
  filePath?: string
  previewUrl?: string
  files: ViewerAssetFile[]
  placements: ViewerAssetPlacement[]
}

export interface ViewerDiagnostic {
  id: string
  layerId?: string
  severity: 'error' | 'warning' | 'info'
  type: string
  message: string
}

export type CanvasSelectionKind = 'asset' | 'text'

export interface CanvasSelectionTarget {
  id: string
  kind: CanvasSelectionKind
  layerId: string
  bounds: Bounds
  assetId?: string
  placementId?: string
}

export type DemoAsset = ViewerAsset
export type DemoDiagnostic = ViewerDiagnostic

export interface MeasurementPoint {
  x: number
  y: number
}

export type RulerAxis = 'horizontal' | 'vertical'

export interface MeasurementLine {
  start: MeasurementPoint
  end: MeasurementPoint
}

export interface DistanceMeasurement extends MeasurementLine {
  horizontal: number
  vertical: number
  distance: number
  label: MeasurementPoint
}

export interface MeasurementSegment extends MeasurementLine {
  axis: 'horizontal' | 'vertical'
  value: number
  label: MeasurementPoint
  extensions: MeasurementLine[]
}

export interface Measurement {
  horizontal: number
  vertical: number
  segments: MeasurementSegment[]
}
