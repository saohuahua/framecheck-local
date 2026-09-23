import type { AssetManifest, DesignSnapshot } from '../../src/features/bundle/schema'
import type { VueExportRequest } from '../../src/features/codegen/types'

/**
 * Vue 导出测试共用的合成设计事实。
 *
 * 覆盖全部还原规则的迷你设计稿：
 * 标记组烘焙 / frame 优先定位 / 可点击 button / 真实文字 / 未标记清单 /
 * 同名与同资产去重。生成器单测与导出对话框组件测试共用这份夹具。
 */

/** h5-template 模板 router/index.ts 的真实结构（作为路由补丁基准） */
export const templateRouterSource = [
  'import { createRouter, createWebHistory } from "vue-router";',
  'import Layout from "@/layout/index.vue";',
  'import HomeView from "@/views/home-view/index.vue";',
  '',
  'const router = createRouter({',
  '  history: createWebHistory(import.meta.env.BASE_URL),',
  '  routes: [',
  '    {',
  '      path: "/",',
  '      name: "layout",',
  '      component: Layout,',
  '      children: [',
  '        {',
  '          path: "/",',
  '          name: "home",',
  '          component: HomeView',
  '        }',
  '      ]',
  '    }',
  '  ]',
  '});',
  '',
  'export default router;',
  '',
].join('\n')

type DesignNode = DesignSnapshot['nodes'][number]

function createNode(node: Partial<DesignNode> & Pick<DesignNode, 'id' | 'name' | 'kind'>): DesignNode {
  return {
    parentId: 'root',
    order: 0,
    path: node.name,
    logicalBounds: { x: 0, y: 0, width: 10, height: 10 },
    children: [],
    ...node,
  }
}

export function createVueExportFacts(): { design: DesignSnapshot; assets: AssetManifest } {
  const design: DesignSnapshot = {
    schemaVersion: '1.1.0',
    source: { name: 'demo.psd', size: 1, sha256: 'a'.repeat(64) },
    document: { name: 'demo', width: 750, height: 1200 },
    rootIds: ['root'],
    nodes: [
      {
        id: 'root',
        parentId: null,
        order: 0,
        name: 'Root',
        path: 'Root',
        kind: 'group',
        logicalBounds: { x: 0, y: 0, width: 750, height: 1200 },
        children: ['hero', 'cta', 'footer', 'decor', 'old-page', 'badge-a', 'badge-b'],
      },
      // 标记组：整体导出为一张切图，内部子层不单独还原
      createNode({
        id: 'hero',
        name: 'Hero',
        kind: 'group',
        order: 0,
        path: 'Root/Hero',
        logicalBounds: { x: 0, y: 0, width: 750, height: 800 },
        children: ['hero-inner'],
        export: { marked: true, marker: '-h-', mode: 'tight' },
      }),
      createNode({
        id: 'hero-inner',
        parentId: 'hero',
        name: 'Hero Inner',
        kind: 'image',
        order: 0,
        path: 'Root/Hero/Hero Inner',
        logicalBounds: { x: 10, y: 10, width: 500, height: 400 },
      }),
      // 标记切图：frame 与 logicalBounds 不同，定位必须取 frame；半透明
      createNode({
        id: 'cta',
        name: 'CTA_Btn',
        kind: 'image',
        order: 1,
        path: 'Root/CTA_Btn',
        logicalBounds: { x: 120, y: 910, width: 60, height: 30 },
        opacity: 0.8,
        export: { marked: true, marker: '-h-', mode: 'tight' },
      }),
      // 未标记文本：还原为真实文字
      createNode({
        id: 'footer',
        name: 'Footer Note',
        kind: 'text',
        order: 2,
        path: 'Root/Footer Note',
        logicalBounds: { x: 75, y: 1000, width: 600, height: 30 },
        text: {
          content: 'A & B <tag> 联系我们',
          style: {
            font_size: 24,
            leading: 30,
            font_family: 'FixtureFont',
            font_weight: 600,
            letter_spacing: 2,
            color: 'rgba(255, 255, 255, 1)',
            text_align: 'center',
          },
        },
      }),
      // 未标记视觉层：进未还原清单
      createNode({
        id: 'decor',
        name: 'Decor',
        kind: 'image',
        order: 3,
        path: 'Root/Decor',
        logicalBounds: { x: 0, y: 1100, width: 750, height: 100 },
      }),
      // 未标记组（子层全部未标记）：清单里只登记组本身
      createNode({
        id: 'old-page',
        name: 'Old Page',
        kind: 'group',
        order: 4,
        path: 'Root/Old Page',
        logicalBounds: { x: 0, y: 0, width: 750, height: 1200 },
        children: ['op-a', 'op-b'],
      }),
      createNode({
        id: 'op-a',
        parentId: 'old-page',
        name: 'Old A',
        kind: 'image',
        order: 0,
        path: 'Root/Old Page/Old A',
        logicalBounds: { x: 0, y: 0, width: 100, height: 50 },
      }),
      createNode({
        id: 'op-b',
        parentId: 'old-page',
        name: 'Old B',
        kind: 'image',
        order: 1,
        path: 'Root/Old Page/Old B',
        logicalBounds: { x: 0, y: 60, width: 100, height: 50 },
      }),
      // 两个同名图层引用同一资产：文件名共用、类名去重
      createNode({
        id: 'badge-a',
        name: 'Badge',
        kind: 'image',
        order: 5,
        path: 'Root/Badge',
        logicalBounds: { x: 20, y: 20, width: 40, height: 40 },
        export: { marked: true, marker: '-h-', mode: 'tight' },
      }),
      createNode({
        id: 'badge-b',
        name: 'Badge',
        kind: 'image',
        order: 6,
        path: 'Root/Badge',
        logicalBounds: { x: 80, y: 20, width: 40, height: 40 },
        export: { marked: true, marker: '-h-', mode: 'tight' },
      }),
    ],
    reference: 'reference.png',
    stats: { nodes: 10 },
    diagnostics: [],
  }

  const assets: AssetManifest = {
    schemaVersion: '1.0.0',
    source: { name: 'demo.psd', size: 1, sha256: 'a'.repeat(64) },
    assets: [
      {
        id: 'hero-asset',
        file: 'assets/hero-9.png',
        format: 'png',
        pixelSize: { width: 750, height: 800 },
        sha256: 'b'.repeat(64),
        bytes: 1,
        logicalSize: { width: 750, height: 800 },
        files: { '1': 'assets/hero-9.png' },
      },
      {
        id: 'cta-asset',
        file: 'assets/cta-1.png',
        format: 'png',
        pixelSize: { width: 80, height: 40 },
        sha256: 'c'.repeat(64),
        bytes: 1,
        logicalSize: { width: 80, height: 40 },
        files: { '1': 'assets/cta-1.png' },
      },
      {
        id: 'badge-asset',
        file: 'assets/badge-7.png',
        format: 'png',
        pixelSize: { width: 40, height: 40 },
        sha256: 'd'.repeat(64),
        bytes: 1,
        logicalSize: { width: 40, height: 40 },
        files: { '1': 'assets/badge-7.png' },
      },
    ],
    placements: [
      {
        id: 'placement-hero',
        nodeId: 'hero',
        assetId: 'hero-asset',
        marker: '-h-',
        mode: 'tight',
        frame: { x: 0, y: 0, width: 750, height: 800 },
      },
      {
        id: 'placement-cta',
        nodeId: 'cta',
        assetId: 'cta-asset',
        marker: '-h-',
        mode: 'tight',
        frame: { x: 100, y: 900, width: 80, height: 40 },
      },
      {
        id: 'placement-badge-a',
        nodeId: 'badge-a',
        assetId: 'badge-asset',
        marker: '-h-',
        mode: 'tight',
        frame: { x: 20, y: 20, width: 40, height: 40 },
      },
      {
        id: 'placement-badge-b',
        nodeId: 'badge-b',
        assetId: 'badge-asset',
        marker: '-h-',
        mode: 'tight',
        frame: { x: 80, y: 20, width: 40, height: 40 },
      },
    ],
    lineage: [],
    stats: { marked: 4, exported: 4, uniqueAssets: 3 },
    diagnostics: [],
  }

  return { design, assets }
}

export function createVueExportRequest(overrides: Partial<VueExportRequest> = {}): VueExportRequest {
  const { design, assets } = createVueExportFacts()
  return {
    design,
    assets,
    options: { pageName: 'demo-page' },
    ...overrides,
  }
}
