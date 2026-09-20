import type { OpenedBundle } from './bundle-repository'
import type { AssetManifest, DesignSnapshot, DiagnosticsPayload } from './schema'
import type { LocalBundleRecord } from './types'
import type { DesignLayer, LayerType, ViewerAsset, ViewerDiagnostic } from '../viewer/types'

function layerType(kind: string): LayerType {
  if (kind === 'group' || kind === 'component') {
    return 'group'
  }
  if (kind === 'text') {
    return 'text'
  }
  if (kind === 'shape') {
    return 'shape'
  }
  if (kind === 'smart-object') {
    return 'smartobject'
  }
  return 'image'
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function diagnosticSeverity(code: string | undefined, value: Record<string, unknown>): ViewerDiagnostic['severity'] {
  const explicit = asString(value.severity)
  if (explicit === 'error' || explicit === 'warning') {
    return explicit
  }
  if (code === 'export_failed') {
    return 'error'
  }
  if (code === 'hidden_marked' || code === 'missing_font' || code === 'effect_downgrade') {
    return 'warning'
  }
  return 'info'
}

function diagnosticMessage(code: string, value: Record<string, unknown>): string {
  const explicit = asString(value.message)
  if (explicit) {
    return explicit
  }
  const name = asString(value.name) ?? asString(value.path) ?? '未命名图层'
  const marker = asString(value.marker)
  if (code === 'hidden_marked') {
    return `已标记资源 ${name}${marker ? ` 使用 ${marker}` : ''} 在源 PSD 中处于隐藏状态`
  }
  return `${name} 触发 CLI 诊断 ${code}`
}

function diagnosticValues(payload: DiagnosticsPayload, design: DesignSnapshot): ViewerDiagnostic[] {
  const nodeIdsByPath = new Map(design.nodes.map((node) => [node.path, node.id]))
  const values = [
    ...payload.design.map((value) => ({ value, source: 'design' })),
    ...payload.assets.map((value) => ({ value, source: 'assets' })),
  ]

  return values.map(({ value, source }, index) => {
    const raw = value as Record<string, unknown>
    const path = asString(raw.path)
    const code = asString(raw.type) ?? asString(raw.code) ?? `${source}_diagnostic`
    return {
      id: asString(raw.id) ?? `${source}:${index}`,
      layerId: asString(raw.nodeId) ?? asString(raw.layerId) ?? (path ? nodeIdsByPath.get(path) : undefined),
      severity: diagnosticSeverity(code, raw),
      type: code,
      message: diagnosticMessage(code, raw),
    }
  })
}

function hasUnsupportedValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0
  }
  return false
}

function unsupportedFieldDiagnostics(design: DesignSnapshot): ViewerDiagnostic[] {
  const fields = [
    ['effects', '图层效果'],
    ['masks', '遮罩'],
    ['fills', '复杂填充'],
    ['geometry', '路径几何'],
    ['transform', '复杂变换'],
    ['clipping', '剪贴关系'],
  ] as const
  const occurrences = new Map<string, { label: string; nodeIds: string[] }>()

  for (const node of design.nodes) {
    const rawNode = node as Record<string, unknown>
    for (const [field, label] of fields) {
      if (!hasUnsupportedValue(rawNode[field])) {
        continue
      }
      const occurrence = occurrences.get(field) ?? { label, nodeIds: [] }
      occurrence.nodeIds.push(node.id)
      occurrences.set(field, occurrence)
    }

    if (hasUnsupportedValue(node.text?.runs)) {
      const occurrence = occurrences.get('text-runs') ?? { label: '文本样式 runs', nodeIds: [] }
      occurrence.nodeIds.push(node.id)
      occurrences.set('text-runs', occurrence)
    }
  }

  return [...occurrences.entries()].map(([field, occurrence]) => ({
    id: `unsupported:${field}`,
    layerId: occurrence.nodeIds[0],
    severity: 'info' as const,
    type: `unsupported_${field}`,
    message: `${occurrence.nodeIds.length} 个图层包含${occurrence.label}，当前 V3 仅保留原始事实并在诊断中提示，属性面板不补假数据`,
  }))
}

function assetValues(manifest: AssetManifest, design: DesignSnapshot): ViewerAsset[] {
  const nodeById = new Map(design.nodes.map((node) => [node.id, node]))
  const lineageById = new Map(manifest.lineage.map((lineage) => [lineage.id, lineage]))

  return manifest.assets.map((asset) => {
    const placements = manifest.placements.filter((placement) => placement.assetId === asset.id)
    const layerIds = [...new Set(placements.map((placement) => placement.nodeId))]
    const markers = [...new Set(placements.map((placement) => asString(placement.marker)).filter(Boolean))]
    const modes = [...new Set(placements.map((placement) => asString(placement.mode)).filter(Boolean))]
    const scales = Object.keys(asset.files)
      .map((scale) => `${scale}x`)
      .join(' ')
    const viewerPlacements = placements.map((placement) => {
      const node = nodeById.get(placement.nodeId)
      const lineage = placement.lineageId ? lineageById.get(placement.lineageId) : undefined
      return {
        id: placement.id,
        nodeId: placement.nodeId,
        bounds: placement.frame ?? node?.logicalBounds ?? {
          x: 0,
          y: 0,
          width: asset.logicalSize.width,
          height: asset.logicalSize.height,
        },
        logicalBounds: placement.logicalBounds ?? node?.logicalBounds,
        marker: placement.marker,
        mode: placement.mode,
        density: placement.density,
        lineageNodeIds: lineage?.inputNodeIds ?? [placement.nodeId],
      }
    })
    const firstNode = placements[0] ? nodeById.get(placements[0].nodeId) : undefined

    return {
      id: asset.id,
      displayName: firstNode?.name || asset.file.split('/').at(-1) || '未命名切图',
      layerId: layerIds.length === 1 ? layerIds[0] : undefined,
      layerIds,
      marker: markers.join(' ') || '未标记',
      name: asset.file.split('/').at(-1) ?? asset.file,
      format: asset.format.toUpperCase(),
      logicalSize: `${asset.logicalSize.width} x ${asset.logicalSize.height} px`,
      pixelSize: `${asset.pixelSize.width} x ${asset.pixelSize.height} px`,
      scales,
      placement: modes.join(' / ') || '未提供',
      filePath: asset.file,
      files: Object.entries(asset.files)
        .map(([scale, path]) => ({ scale: Number(scale), path }))
        .sort((left, right) => left.scale - right.scale),
      placements: viewerPlacements,
    }
  })
}

function layerValues(design: DesignSnapshot, diagnostics: ViewerDiagnostic[], assets: ViewerAsset[]): DesignLayer[] {
  const assetByLayerId = new Map<string, string>()
  for (const asset of assets) {
    for (const layerId of asset.layerIds ?? (asset.layerId ? [asset.layerId] : [])) {
      assetByLayerId.set(layerId, asset.id)
    }
  }
  const diagnosticsByLayerId = new Map<string, string[]>()
  for (const diagnostic of diagnostics) {
    if (!diagnostic.layerId) {
      continue
    }
    diagnosticsByLayerId.set(diagnostic.layerId, [
      ...(diagnosticsByLayerId.get(diagnostic.layerId) ?? []),
      diagnostic.id,
    ])
  }

  const layersById = new Map<string, DesignLayer>()
  for (const node of design.nodes) {
    const textStyle = node.text?.style
    layersById.set(node.id, {
      id: node.id,
      name: node.name,
      type: layerType(node.kind),
      sourceKind: node.sourceKind ?? node.kind,
      path: node.path,
      parentId: node.parentId,
      order: node.order,
      bounds: node.logicalBounds,
      paintBounds: node.paintBounds ?? undefined,
      visible: (node.opacity ?? 1) > 0,
      text: node.text?.content,
      assetId: assetByLayerId.get(node.id),
      diagnosticIds: diagnosticsByLayerId.get(node.id),
      style: {
        opacity: Math.round((node.opacity ?? 1) * 100),
        blendMode: node.blendMode ?? 'normal',
        fontFamily: textStyle?.font_family,
        fontPostScriptName: textStyle?.font_ps_name,
        fontSize: textStyle?.font_size,
        fontWeight: textStyle?.font_weight,
        lineHeight: textStyle?.leading,
        letterSpacing: textStyle?.letter_spacing,
        textAlign: textStyle?.text_align,
        color: textStyle?.color,
      },
    })
  }

  const roots: DesignLayer[] = []
  for (const node of design.nodes) {
    const layer = layersById.get(node.id)
    if (!layer) {
      continue
    }
    const parent = node.parentId ? layersById.get(node.parentId) : undefined
    if (parent) {
      parent.children = [...(parent.children ?? []), layer]
    } else {
      roots.push(layer)
    }
  }

  function sortLayers(layers: DesignLayer[]) {
    layers.sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    for (const layer of layers) {
      if (layer.children) {
        sortLayers(layer.children)
      }
    }
  }

  sortLayers(roots)
  return roots
}

export interface LocalViewerPayload {
  record: LocalBundleRecord
  sourceName: string
  reference: File
  layers: DesignLayer[]
  assets: ViewerAsset[]
  diagnostics: ViewerDiagnostic[]
  canvas: {
    width: number
    height: number
  }
}

export function toLocalViewerPayload(opened: OpenedBundle): LocalViewerPayload {
  const diagnostics = [
    ...diagnosticValues(opened.validated.diagnostics, opened.validated.design),
    ...unsupportedFieldDiagnostics(opened.validated.design),
  ]
  const assets = assetValues(opened.validated.assets, opened.validated.design)
  return {
    record: opened.record,
    sourceName: opened.validated.bundle.source.name,
    reference: opened.artifacts.reference,
    layers: layerValues(opened.validated.design, diagnostics, assets),
    assets,
    diagnostics,
    canvas: {
      width: opened.validated.design.document.width,
      height: opened.validated.design.document.height,
    },
  }
}
