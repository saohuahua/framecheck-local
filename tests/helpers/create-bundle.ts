import { BlobWriter, TextReader, Uint8ArrayReader, ZipWriter, configure } from '@zip.js/zip.js'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

configure({ useWebWorkers: false })

const sourceSha256 = 'c'.repeat(64)
const tinyPng = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
  137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192,
  240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0,
  73, 69, 78, 68, 174, 66, 96, 130,
])

export async function createValidBundleFixture() {
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  const addJson = (path: string, value: object) => writer.add(path, new TextReader(JSON.stringify(value)))

  await addJson('bundle.json', {
    schemaVersion: '1.0.0',
    kind: 'psd-design-bundle',
    source: { name: 'fixture.psd', size: 32, sha256: sourceSha256 },
    artifacts: {
      reference: 'reference.png',
      design: 'design.json',
      assets: 'assets.json',
      diagnostics: 'diagnostics.json',
    },
    stats: { nodes: 1, marked: 0, exported: 0, uniqueAssets: 0 },
  })
  await addJson('design.json', {
    schemaVersion: '1.0.0',
    source: { path: 'fixture.psd', name: 'fixture.psd', size: 32, sha256: sourceSha256 },
    document: { name: 'fixture', width: 1, height: 1 },
    rootIds: ['root'],
    nodes: [{
      id: 'root',
      parentId: null,
      order: 0,
      name: 'Root',
      path: 'Root',
      kind: 'group',
      logicalBounds: { x: 0, y: 0, width: 1, height: 1 },
      paintBounds: { x: 0, y: 0, width: 1, height: 1 },
      children: [],
    }],
    reference: 'reference.png',
    stats: { nodes: 1 },
    diagnostics: [],
  })
  await writer.add('reference.png', new Uint8ArrayReader(tinyPng))
  await addJson('assets.json', {
    schemaVersion: '1.0.0',
    source: { path: 'fixture.psd', name: 'fixture.psd', size: 32, sha256: sourceSha256 },
    assets: [],
    placements: [],
    lineage: [],
    stats: { marked: 0, exported: 0, uniqueAssets: 0 },
    diagnostics: [],
  })
  await addJson('diagnostics.json', {
    schemaVersion: '1.0.0',
    design: [],
    assets: [],
  })

  const archive = await writer.close()
  const directory = await mkdtemp(join(tmpdir(), 'framecheck-e2e-'))
  const path = join(directory, 'fixture.psd-bundle.zip')
  await writeFile(path, Buffer.from(await archive.arrayBuffer()))
  return path
}

export async function createScrollableBundleFixture() {
  const assetCount = 28
  const textCount = 28
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  const addJson = (path: string, value: object) => writer.add(path, new TextReader(JSON.stringify(value)))
  const assetNodeIds = Array.from({ length: assetCount }, (_, index) => `asset-node-${index}`)
  const textNodeIds = Array.from({ length: textCount }, (_, index) => `text-node-${index}`)
  const nodeIds = [...assetNodeIds, ...textNodeIds]

  await addJson('bundle.json', {
    schemaVersion: '1.0.0',
    kind: 'psd-design-bundle',
    source: { name: 'scrollable.psd', size: 32, sha256: sourceSha256 },
    artifacts: {
      reference: 'reference.png',
      design: 'design.json',
      assets: 'assets.json',
      diagnostics: 'diagnostics.json',
    },
    stats: { nodes: nodeIds.length + 1, marked: assetCount, exported: assetCount, uniqueAssets: assetCount },
  })
  await addJson('design.json', {
    schemaVersion: '1.0.0',
    source: { path: 'scrollable.psd', name: 'scrollable.psd', size: 32, sha256: sourceSha256 },
    document: { name: 'scrollable', width: 1, height: 1 },
    rootIds: ['root'],
    nodes: [
      {
        id: 'root',
        parentId: null,
        order: 0,
        name: 'Root',
        path: 'Root',
        kind: 'group',
        logicalBounds: { x: 0, y: 0, width: 1, height: 1 },
        paintBounds: { x: 0, y: 0, width: 1, height: 1 },
        children: nodeIds,
      },
      ...assetNodeIds.map((id, index) => ({
        id,
        parentId: 'root',
        order: index + 1,
        name: `Asset ${index + 1}`,
        path: `Root/Asset ${index + 1}`,
        kind: 'image',
        logicalBounds: { x: 0, y: index, width: 1, height: 1 },
        paintBounds: { x: 0, y: index, width: 1, height: 1 },
      })),
      ...textNodeIds.map((id, index) => ({
        id,
        parentId: 'root',
        order: assetCount + index + 1,
        name: `Text ${index + 1}`,
        path: `Root/Text ${index + 1}`,
        kind: 'text',
        logicalBounds: { x: 0, y: assetCount + index, width: 1, height: 1 },
        paintBounds: { x: 0, y: assetCount + index, width: 1, height: 1 },
        text: { content: `Scrollable text ${index + 1}` },
      })),
    ],
    reference: 'reference.png',
    stats: { nodes: nodeIds.length + 1 },
    diagnostics: [],
  })
  await writer.add('reference.png', new Uint8ArrayReader(tinyPng))

  const assets = assetNodeIds.map((nodeId, index) => ({
    id: `asset-${index}`,
    file: `assets/asset-${index}.png`,
    format: 'png',
    pixelSize: { width: 1, height: 1 },
    sha256: sourceSha256,
    bytes: tinyPng.length,
    logicalSize: { width: 1, height: 1 },
    files: { '1': `assets/asset-${index}.png` },
    nodeId,
  }))
  await addJson('assets.json', {
    schemaVersion: '1.0.0',
    source: { path: 'scrollable.psd', name: 'scrollable.psd', size: 32, sha256: sourceSha256 },
    assets: assets.map(({ nodeId: _nodeId, ...asset }) => asset),
    placements: assets.map((asset, index) => ({
      id: `placement-${index}`,
      nodeId: asset.nodeId,
      assetId: asset.id,
      marker: '-h-',
      mode: 'tight',
      frame: { x: 0, y: index, width: 1, height: 1 },
    })),
    lineage: [],
    stats: { marked: assetCount, exported: assetCount, uniqueAssets: assetCount },
    diagnostics: [],
  })
  for (const asset of assets) {
    await writer.add(asset.file, new Uint8ArrayReader(tinyPng))
  }
  await addJson('diagnostics.json', {
    schemaVersion: '1.0.0',
    design: [],
    assets: [],
  })

  const archive = await writer.close()
  const directory = await mkdtemp(join(tmpdir(), 'framecheck-e2e-'))
  const path = join(directory, 'scrollable.psd-bundle.zip')
  await writeFile(path, Buffer.from(await archive.arrayBuffer()))
  return path
}

export async function createSelectionBundleFixture() {
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  const addJson = (path: string, value: object) => writer.add(path, new TextReader(JSON.stringify(value)))
  const canvas = { width: 360, height: 240 }

  await addJson('bundle.json', {
    schemaVersion: '1.0.0',
    kind: 'psd-design-bundle',
    source: { name: 'selection.psd', size: 32, sha256: sourceSha256 },
    artifacts: {
      reference: 'reference.png',
      design: 'design.json',
      assets: 'assets.json',
      diagnostics: 'diagnostics.json',
    },
    stats: { nodes: 5, marked: 2, exported: 2, uniqueAssets: 2 },
  })
  await addJson('design.json', {
    schemaVersion: '1.0.0',
    source: { path: 'selection.psd', name: 'selection.psd', size: 32, sha256: sourceSha256 },
    document: { name: 'selection', ...canvas },
    rootIds: ['root'],
    nodes: [
      {
        id: 'root',
        parentId: null,
        order: 0,
        name: 'Root',
        path: 'Root',
        kind: 'group',
        logicalBounds: { x: 0, y: 0, ...canvas },
        children: ['hero-cutout', 'overlay-copy', 'exported-label', 'selection-mask'],
      },
      {
        id: 'hero-cutout',
        parentId: 'root',
        order: 1,
        name: 'Hero cutout',
        path: 'Root/Hero cutout',
        kind: 'group',
        logicalBounds: { x: 90, y: 90, width: 100, height: 24 },
      },
      {
        id: 'overlay-copy',
        parentId: 'root',
        order: 2,
        name: 'Overlay copy',
        path: 'Root/Overlay copy',
        kind: 'text',
        logicalBounds: { x: 80, y: 80, width: 140, height: 42 },
        text: {
          content: 'Overlay text',
          style: {
            font_size: 29.999999373448713,
            leading: 31.456789,
            font_family: 'Fixture Sans',
            font_weight: 600,
            letter_spacing: 2.4000001,
            color: 'rgba(84, 17, 0, 1)',
            text_align: 'right',
          },
        },
      },
      {
        id: 'selection-mask',
        parentId: 'root',
        order: 4,
        name: 'Selection mask',
        path: 'Root/Selection mask',
        kind: 'shape',
        logicalBounds: { x: 0, y: 0, ...canvas },
      },
      {
        id: 'exported-label',
        parentId: 'root',
        order: 3,
        name: 'Exported label',
        path: 'Root/Exported label',
        kind: 'text',
        logicalBounds: { x: 20, y: 210, width: 120, height: 20 },
        text: { content: 'Exported text' },
      },
    ],
    reference: 'reference.png',
    stats: { nodes: 5 },
    diagnostics: [],
  })
  await writer.add('reference.png', new Uint8ArrayReader(tinyPng))
  await addJson('assets.json', {
    schemaVersion: '1.0.0',
    source: { path: 'selection.psd', name: 'selection.psd', size: 32, sha256: sourceSha256 },
    assets: [
      {
        id: 'hero-asset',
        file: 'assets/hero-cutout.png',
        format: 'png',
        pixelSize: { width: 280, height: 180 },
        sha256: sourceSha256,
        bytes: tinyPng.length,
        logicalSize: { width: 280, height: 180 },
        files: { '1': 'assets/hero-cutout.png' },
      },
      {
        id: 'exported-label-asset',
        file: 'assets/exported-label.png',
        format: 'png',
        pixelSize: { width: 120, height: 20 },
        sha256: sourceSha256,
        bytes: tinyPng.length,
        logicalSize: { width: 120, height: 20 },
        files: { '1': 'assets/exported-label.png' },
      },
    ],
    placements: [
      {
        id: 'hero-placement',
        nodeId: 'hero-cutout',
        assetId: 'hero-asset',
        marker: '-h-',
        mode: 'tight',
        frame: { x: 20, y: 20, width: 280, height: 180 },
      },
      {
        id: 'exported-label-placement',
        nodeId: 'exported-label',
        assetId: 'exported-label-asset',
        marker: '-h-',
        mode: 'tight',
        frame: { x: 10, y: 205, width: 140, height: 30 },
      },
    ],
    lineage: [],
    stats: { marked: 2, exported: 2, uniqueAssets: 2 },
    diagnostics: [],
  })
  await writer.add('assets/hero-cutout.png', new Uint8ArrayReader(tinyPng))
  await writer.add('assets/exported-label.png', new Uint8ArrayReader(tinyPng))
  await addJson('diagnostics.json', {
    schemaVersion: '1.0.0',
    design: [],
    assets: [],
  })

  const archive = await writer.close()
  const directory = await mkdtemp(join(tmpdir(), 'framecheck-selection-e2e-'))
  const path = join(directory, 'selection.psd-bundle.zip')
  await writeFile(path, Buffer.from(await archive.arrayBuffer()))
  return path
}
