import { describe, expect, it } from 'vitest'
import { validateArchiveEntries } from '../../src/features/bundle/archive-validation'
import { parsePortableBundleArtifacts } from '../../src/features/bundle/schema'
import { BundleError } from '../../src/features/bundle/types'

const sourceSha256 = 'a'.repeat(64)

function validArtifacts() {
  return {
    bundle: JSON.stringify({
      schemaVersion: '1.0.0',
      kind: 'psd-design-bundle',
      source: { name: 'screen.psd', size: 128, sha256: sourceSha256 },
      artifacts: {
        reference: 'reference.png',
        design: 'design.json',
        assets: 'assets.json',
        diagnostics: 'diagnostics.json',
      },
      stats: { nodes: 1, marked: 0, exported: 0, uniqueAssets: 0 },
    }),
    design: JSON.stringify({
      schemaVersion: '1.0.0',
      source: { path: 'screen.psd', name: 'screen.psd', size: 128, sha256: sourceSha256 },
      document: { name: 'screen', width: 100, height: 200 },
      rootIds: ['root'],
      nodes: [{
        id: 'root',
        parentId: null,
        order: 0,
        name: 'Root',
        path: 'Root',
        kind: 'group',
        logicalBounds: { x: 0, y: 0, width: 100, height: 200 },
      }],
      reference: 'reference.png',
      stats: { nodes: 1 },
      diagnostics: [],
    }),
    assets: JSON.stringify({
      schemaVersion: '1.0.0',
      source: { path: 'screen.psd', name: 'screen.psd', size: 128, sha256: sourceSha256 },
      assets: [],
      placements: [],
      lineage: [],
      stats: { marked: 0, exported: 0, uniqueAssets: 0 },
      diagnostics: [],
    }),
    diagnostics: JSON.stringify({
      schemaVersion: '1.0.0',
      design: [],
      assets: [],
    }),
  }
}

function validEntries() {
  return [
    'bundle.json',
    'design.json',
    'reference.png',
    'assets.json',
    'diagnostics.json',
  ].map((filename) => ({
    filename,
    directory: false,
    symlink: false,
    encrypted: false,
    compressedSize: 10,
    uncompressedSize: 10,
  }))
}

describe('PortablePsdBundle 校验', () => {
  it('接受 psd-design-bundle 1.0.0 的最小合法工件', () => {
    expect(parsePortableBundleArtifacts(validArtifacts()).bundle.kind).toBe('psd-design-bundle')
    expect(validateArchiveEntries(validEntries(), 100)).toBe(50)
  })

  it('拒绝缺少必需工件的压缩包', () => {
    const entries = validEntries().filter((entry) => entry.filename !== 'diagnostics.json')
    expectBundleError(() => validateArchiveEntries(entries, 100), 'missing-artifact')
  })

  it('拒绝未知 bundle schema', () => {
    const artifacts = validArtifacts()
    artifacts.bundle = artifacts.bundle.replace('"1.0.0"', '"9.0.0"')
    expectBundleError(() => parsePortableBundleArtifacts(artifacts), 'invalid-schema')
  })

  it('拒绝 Zip Slip 路径', () => {
    const entries = [...validEntries(), {
      filename: '../bundle.json',
      directory: false,
      symlink: false,
      encrypted: false,
      compressedSize: 10,
      uncompressedSize: 10,
    }]
    expectBundleError(() => validateArchiveEntries(entries, 100), 'unsafe-path')
  })
})

function expectBundleError(action: () => unknown, code: BundleError['code']) {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(BundleError)
    expect((error as BundleError).code).toBe(code)
    return
  }
  throw new Error('预期 BundleError')
}
