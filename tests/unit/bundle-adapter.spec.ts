import { describe, expect, it } from 'vitest'
import { toLocalViewerPayload } from '../../src/features/bundle/bundle-adapter'
import type { OpenedBundle } from '../../src/features/bundle/bundle-repository'
import { parsePortableBundleArtifacts } from '../../src/features/bundle/schema'

const sourceSha256 = 'd'.repeat(64)

function openedBundle(marker: string): OpenedBundle {
  const validated = parsePortableBundleArtifacts({
    bundle: JSON.stringify({
      schemaVersion: '1.0.0',
      kind: 'psd-design-bundle',
      source: { name: 'marker.psd', size: 64, sha256: sourceSha256 },
      artifacts: {
        reference: 'reference.png',
        design: 'design.json',
        assets: 'assets.json',
        diagnostics: 'diagnostics.json',
      },
      stats: { nodes: 1, marked: 1, exported: 1, uniqueAssets: 1 },
    }),
    design: JSON.stringify({
      schemaVersion: '1.0.0',
      source: { path: 'marker.psd', name: 'marker.psd', size: 64, sha256: sourceSha256 },
      document: { name: 'marker', width: 10, height: 10 },
      rootIds: ['node-1'],
      nodes: [{
        id: 'node-1',
        parentId: null,
        order: 0,
        name: 'Resource',
        path: 'Resource',
        kind: 'image',
        logicalBounds: { x: 0, y: 0, width: 10, height: 10 },
      }],
      reference: 'reference.png',
      stats: { nodes: 1 },
      diagnostics: [],
    }),
    assets: JSON.stringify({
      schemaVersion: '1.0.0',
      source: { path: 'marker.psd', name: 'marker.psd', size: 64, sha256: sourceSha256 },
      assets: [{
        id: 'asset-1',
        file: 'assets/resource.png',
        format: 'png',
        pixelSize: { width: 10, height: 10 },
        sha256: sourceSha256,
        bytes: 10,
        logicalSize: { width: 10, height: 10 },
        files: { '1': 'assets/resource.png' },
      }],
      placements: [{ id: 'placement-1', nodeId: 'node-1', assetId: 'asset-1', marker, mode: 'fixed' }],
      lineage: [],
      stats: { marked: 1, exported: 1, uniqueAssets: 1 },
      diagnostics: [],
    }),
    diagnostics: JSON.stringify({ schemaVersion: '1.0.0', design: [], assets: [] }),
  })

  return {
    record: {
      localBundleId: 'marker',
      importedAt: '2026-09-16T00:00:00.000Z',
      archiveName: 'marker.psd-bundle.zip',
      archiveSize: 100,
      sourceSha256,
      portableSchemaVersion: '1.0.0',
      storagePrefix: 'bundles/marker',
      status: 'ready',
      storageBytes: 100,
      canvasWidth: 10,
      canvasHeight: 10,
      diagnosticsCount: 0,
    },
    validated,
    artifacts: {
      bundle: validated.bundle,
      design: validated.design,
      assets: validated.assets,
      diagnostics: validated.diagnostics,
      reference: new File([], 'reference.png', { type: 'image/png' }),
    },
  }
}

describe('CLI resource marker adapter', () => {
  it('保留 -s- 固定尺寸资源 marker 和 placement', () => {
    const payload = toLocalViewerPayload(openedBundle('-s-'))

    expect(payload.assets[0]).toMatchObject({
      marker: '-s-',
      placement: 'fixed',
      layerIds: ['node-1'],
    })
  })
})
