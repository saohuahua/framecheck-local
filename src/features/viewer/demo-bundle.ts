import type { DemoAsset, DemoDiagnostic, DesignLayer } from './types'

export const demoCanvas = {
  width: 1440,
  height: 1000,
}

export const demoBundle = {
  name: 'nova-speaker.psd-bundle.zip',
  sourceName: 'nova-speaker.psd',
  importedAt: '演示数据',
  size: '4.8 MB',
  status: 'demo' as const,
}

// 演示数据只驱动 V0 看稿状态
export const demoLayers: DesignLayer[] = [
  {
    id: 'navigation',
    name: 'Navigation',
    type: 'group',
    bounds: { x: 0, y: 0, width: 1440, height: 92 },
    visible: true,
    style: { opacity: 100, blendMode: 'normal' },
    children: [
      {
        id: 'brand-mark',
        name: 'NOVA',
        type: 'text',
        bounds: { x: 84, y: 38, width: 68, height: 18 },
        visible: true,
        text: 'NOVA',
        style: {
          opacity: 100,
          blendMode: 'normal',
          fontFamily: 'Inter',
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 24,
          letterSpacing: 1.2,
          color: '#111111',
        },
      },
      {
        id: 'nav-links',
        name: 'Nav links',
        type: 'text',
        bounds: { x: 940, y: 40, width: 236, height: 16 },
        visible: true,
        text: 'Products Studio Journal',
        style: {
          opacity: 100,
          blendMode: 'normal',
          fontFamily: 'Inter',
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 20,
          letterSpacing: 0,
          color: '#5f5f5a',
        },
      },
    ],
  },
  {
    id: 'hero',
    name: 'Hero',
    type: 'group',
    bounds: { x: 84, y: 150, width: 1272, height: 510 },
    visible: true,
    style: { opacity: 100, blendMode: 'normal' },
    children: [
      {
        id: 'hero-eyebrow',
        name: 'Collection label',
        type: 'text',
        bounds: { x: 84, y: 166, width: 160, height: 18 },
        visible: true,
        text: 'OBJECT NO 01',
        style: {
          opacity: 100,
          blendMode: 'normal',
          fontFamily: 'Inter',
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 18,
          letterSpacing: 1.4,
          color: '#6f6f69',
        },
      },
      {
        id: 'hero-title',
        name: 'The Quiet Object',
        type: 'text',
        bounds: { x: 84, y: 208, width: 550, height: 152 },
        visible: true,
        text: 'The quiet object',
        style: {
          opacity: 100,
          blendMode: 'normal',
          fontFamily: 'Inter',
          fontSize: 74,
          fontWeight: 600,
          lineHeight: 78,
          letterSpacing: -2.4,
          color: '#151513',
        },
      },
      {
        id: 'hero-copy',
        name: 'Hero body copy',
        type: 'text',
        bounds: { x: 86, y: 402, width: 365, height: 48 },
        visible: true,
        text: 'A compact listening instrument made for rooms that ask for less.',
        style: {
          opacity: 100,
          blendMode: 'normal',
          fontFamily: 'Inter',
          fontSize: 16,
          fontWeight: 400,
          lineHeight: 24,
          letterSpacing: 0,
          color: '#5f5f5a',
        },
      },
      {
        id: 'hero-button',
        name: 'Explore object button',
        type: 'shape',
        bounds: { x: 84, y: 494, width: 160, height: 46 },
        visible: true,
        style: {
          opacity: 100,
          blendMode: 'normal',
          fill: '#151513',
          borderRadius: 4,
        },
      },
      {
        id: 'speaker-render',
        name: 'Speaker render -h-',
        type: 'smartobject',
        bounds: { x: 786, y: 128, width: 480, height: 486 },
        paintBounds: { x: 758, y: 116, width: 536, height: 528 },
        visible: true,
        assetId: 'asset-speaker',
        diagnosticIds: ['diag-effect'],
        style: {
          opacity: 100,
          blendMode: 'normal',
        },
      },
    ],
  },
  {
    id: 'specification',
    name: 'Specification',
    type: 'group',
    bounds: { x: 84, y: 724, width: 1272, height: 180 },
    visible: true,
    style: { opacity: 100, blendMode: 'normal' },
    children: [
      {
        id: 'spec-heading',
        name: 'Specification heading',
        type: 'text',
        bounds: { x: 84, y: 752, width: 180, height: 24 },
        visible: true,
        text: 'Built for stillness',
        style: {
          opacity: 100,
          blendMode: 'normal',
          fontFamily: 'Inter',
          fontSize: 20,
          fontWeight: 600,
          lineHeight: 28,
          letterSpacing: 0,
          color: '#151513',
        },
      },
      {
        id: 'spec-line',
        name: 'Section divider',
        type: 'shape',
        bounds: { x: 84, y: 714, width: 1272, height: 1 },
        visible: true,
        style: { opacity: 100, blendMode: 'normal', fill: '#d9d9d5' },
      },
    ],
  },
]

export const demoAssets: DemoAsset[] = [
  {
    id: 'asset-speaker',
    displayName: 'Speaker render',
    layerId: 'speaker-render',
    marker: '-h-',
    name: 'nova-speaker.png',
    format: 'PNG',
    logicalSize: '480 x 486 px',
    pixelSize: '480 x 486 px',
    scales: '1x',
    placement: 'absolute foreground',
    files: [{ scale: 1, path: 'demo-product.png' }],
    placements: [{
      id: 'placement-speaker',
      nodeId: 'speaker-render',
      bounds: { x: 786, y: 128, width: 480, height: 486 },
      logicalBounds: { x: 786, y: 128, width: 480, height: 486 },
      marker: '-h-',
      mode: 'tight',
      density: 1,
      lineageNodeIds: ['speaker-render'],
    }],
  },
]

export const demoDiagnostics: DemoDiagnostic[] = [
  {
    id: 'diag-effect',
    layerId: 'speaker-render',
    severity: 'warning',
    type: 'effect_downgrade',
    message: '外阴影以扁平预览呈现，paint bounds 已包含扩展范围',
  },
  {
    id: 'diag-font',
    layerId: 'hero-title',
    severity: 'info',
    type: 'missing_font',
    message: '展示字体未随演示 bundle 提供，当前使用预览替代字形',
  },
]

export function flattenLayers(layers: DesignLayer[]): DesignLayer[] {
  return layers.flatMap((layer) => [layer, ...(layer.children ? flattenLayers(layer.children) : [])])
}

export function findDemoLayer(id: string | null): DesignLayer | undefined {
  if (!id) {
    return undefined
  }

  return flattenLayers(demoLayers).find((layer) => layer.id === id)
}
