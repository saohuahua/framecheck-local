// @vitest-environment node

import { BlobReader, TextWriter, ZipReader, configure } from '@zip.js/zip.js'
import { afterAll, describe, expect, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parsePortableBundleArtifacts } from '../../src/features/bundle/schema'
import { toLocalViewerPayload } from '../../src/features/bundle/bundle-adapter'
import type { OpenedBundle } from '../../src/features/bundle/bundle-repository'
import type { LocalBundleRecord } from '../../src/features/bundle/types'
import { flattenLayers } from '../../src/features/viewer/demo-bundle'

configure({ useWebWorkers: false })

const manifestPath = process.env.FRAMECHECK_REAL_FIXTURE_MANIFEST
const packedFixturesPath = process.env.FRAMECHECK_REAL_PACKED_FIXTURES
const resultsPath = process.env.FRAMECHECK_REAL_RESULTS
const enabled = Boolean(manifestPath && packedFixturesPath && resultsPath)
const realDescribe = enabled ? describe : describe.skip
const results: Array<Record<string, unknown>> = []

interface FixtureManifest {
  id: string
  category: string
  sourcePath: string
  sourceBytes: number
  expectation: {
    markers: string[]
    diagnostics: string[]
    document?: { width: number; height: number }
    nodes?: number
    assets?: number
    diagnosticsCount?: number
  }
}

interface PackedFixture {
  id: string
  archivePath: string
  archiveBytes: number
}

const fixtureInputs = enabled
  ? {
      manifest: JSON.parse(await readFile(manifestPath!, 'utf8')) as { fixtures: FixtureManifest[] },
      packed: JSON.parse(await readFile(packedFixturesPath!, 'utf8')) as { packed: PackedFixture[] },
    }
  : { manifest: { fixtures: [] as FixtureManifest[] }, packed: { packed: [] as PackedFixture[] } }

interface ParsedArchive {
  artifacts: {
    assets: string
    bundle: string
    design: string
    diagnostics: string
  }
  reference: Uint8Array
}

realDescribe('真实 psd2code pack bundle 契约', () => {
  for (const fixture of fixtureInputs.manifest.fixtures) {
    it(`${fixture.id} 与 Vue adapter 保持事实一致`, async () => {
      const archive = fixtureInputs.packed.packed.find((item) => item.id === fixture.id)
      expect(archive, `缺少 ${fixture.id} 的已打包 archive`).toBeDefined()
      const parsed = await readArchive(archive!.archivePath)
      const validated = parsePortableBundleArtifacts(parsed.artifacts)
      const reference = new File([parsed.reference], 'reference.png', { type: 'image/png' })
      const record = recordForFixture(fixture, archive!, validated.bundle.source.sha256)
      const payload = toLocalViewerPayload({
        record,
        validated,
        artifacts: {
          bundle: validated.bundle,
          design: validated.design,
          assets: validated.assets,
          diagnostics: validated.diagnostics,
          reference,
        },
      } satisfies OpenedBundle)
      const viewerLayers = flattenLayers(payload.layers)
      const referenceSize = pngSize(parsed.reference)
      const rawDiagnostics = [...validated.diagnostics.design, ...validated.diagnostics.assets]
      const unsupportedDiagnostics = payload.diagnostics.filter((item) => item.type.startsWith('unsupported_'))
      const markers = [...new Set(validated.assets.placements.map((placement) => String(placement.marker ?? '')))]
        .filter(Boolean)
        .sort()

      expect(validated.bundle.schemaVersion).toBe('1.0.0')
      expect(validated.bundle.kind).toBe('psd-design-bundle')
      expect(referenceSize).toEqual({
        width: validated.design.document.width,
        height: validated.design.document.height,
      })
      expect(viewerLayers).toHaveLength(validated.design.nodes.length)
      expect(viewerLayers.map((layer) => [layer.id, layer.name]).sort()).toEqual(
        validated.design.nodes.map((node) => [node.id, node.name]).sort(),
      )
      expect(payload.assets).toHaveLength(validated.assets.assets.length)

      for (const rawAsset of validated.assets.assets) {
        const viewerAsset = payload.assets.find((asset) => asset.id === rawAsset.id)
        const placements = validated.assets.placements.filter((item) => item.assetId === rawAsset.id)
        expect(viewerAsset).toBeDefined()
        expect(viewerAsset?.filePath).toBe(rawAsset.file)
        expect(viewerAsset?.logicalSize).toBe(`${rawAsset.logicalSize.width} x ${rawAsset.logicalSize.height} px`)
        expect(viewerAsset?.pixelSize).toBe(`${rawAsset.pixelSize.width} x ${rawAsset.pixelSize.height} px`)
        expect(viewerAsset?.layerIds?.sort()).toEqual(placements.map((placement) => placement.nodeId).sort())
      }

      expect(payload.diagnostics.length).toBeGreaterThanOrEqual(rawDiagnostics.length)
      for (const marker of fixture.expectation.markers) {
        expect(markers).toContain(marker)
      }
      if (fixture.expectation.document) {
        expect(validated.design.document).toMatchObject(fixture.expectation.document)
      }
      if (fixture.expectation.nodes !== undefined) {
        expect(validated.design.nodes).toHaveLength(fixture.expectation.nodes)
      }
      if (fixture.expectation.assets !== undefined) {
        expect(validated.assets.assets).toHaveLength(fixture.expectation.assets)
      }
      if (fixture.expectation.diagnosticsCount !== undefined) {
        expect(rawDiagnostics).toHaveLength(fixture.expectation.diagnosticsCount)
      }
      for (const diagnosticType of fixture.expectation.diagnostics) {
        expect(rawDiagnostics.map((diagnostic) => String(diagnostic.type ?? diagnostic.code ?? 'untyped')))
          .toContain(diagnosticType)
      }

      results.push({
        id: fixture.id,
        category: fixture.category,
        sourcePath: fixture.sourcePath,
        sourceBytes: fixture.sourceBytes,
        archivePath: archive!.archivePath,
        archiveBytes: archive!.archiveBytes,
        bundle: {
          schemaVersion: validated.bundle.schemaVersion,
          kind: validated.bundle.kind,
          sourceName: validated.bundle.source.name,
          sourceSha256: validated.bundle.source.sha256,
        },
        document: validated.design.document,
        reference: referenceSize,
        nodes: {
          count: validated.design.nodes.length,
          names: validated.design.nodes.map((node) => node.name),
        },
        assets: {
          count: validated.assets.assets.length,
          placements: validated.assets.placements.length,
          markers,
          values: validated.assets.assets.map((asset) => ({
            id: asset.id,
            file: asset.file,
            layerIds: payload.assets.find((viewerAsset) => viewerAsset.id === asset.id)?.layerIds ?? [],
            logicalSize: asset.logicalSize,
            pixelSize: asset.pixelSize,
          })),
        },
        diagnostics: {
          cliCount: rawDiagnostics.length,
          cliTypes: rawDiagnostics.map((diagnostic) => String(diagnostic.type ?? diagnostic.code ?? 'untyped')),
          unsupported: unsupportedDiagnostics.map((diagnostic) => ({
            type: diagnostic.type,
            message: diagnostic.message,
          })),
        },
      })
    })
  }
})

afterAll(async () => {
  if (!enabled) {
    return
  }
  await mkdir(dirname(resultsPath!), { recursive: true })
  await writeFile(resultsPath!, JSON.stringify({ fixtures: results }, null, 2))
})

async function readArchive(path: string): Promise<ParsedArchive> {
  const data = await readFile(path)
  const reader = new ZipReader(new BlobReader(new Blob([data])))
  try {
    const entries = new Map((await reader.getEntries()).map((entry) => [entry.filename, entry]))
    return {
      artifacts: {
        bundle: await readText(entries, 'bundle.json'),
        design: await readText(entries, 'design.json'),
        assets: await readText(entries, 'assets.json'),
        diagnostics: await readText(entries, 'diagnostics.json'),
      },
      reference: new Uint8Array(await readBinary(entries, 'reference.png')),
    }
  } finally {
    await reader.close()
  }
}

async function readText(entries: Map<string, Awaited<ReturnType<ZipReader<Blob>['getEntries']>>[number]>, path: string) {
  const entry = entries.get(path)
  if (!entry || entry.directory) {
    throw new Error(`Missing ${path}`)
  }
  return entry.getData(new TextWriter())
}

async function readBinary(entries: Map<string, Awaited<ReturnType<ZipReader<Blob>['getEntries']>>[number]>, path: string) {
  const entry = entries.get(path)
  if (!entry || entry.directory) {
    throw new Error(`Missing ${path}`)
  }
  return entry.arrayBuffer()
}

function pngSize(value: Uint8Array) {
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength)
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  }
}

function recordForFixture(
  fixture: FixtureManifest,
  archive: PackedFixture,
  sourceSha256: string,
): LocalBundleRecord {
  return {
    localBundleId: fixture.id,
    importedAt: '2026-09-16T00:00:00.000Z',
    archiveName: archive.archivePath.split(/[\\/]/).at(-1) ?? archive.archivePath,
    archiveSize: archive.archiveBytes,
    sourceSha256,
    portableSchemaVersion: '1.0.0',
    storagePrefix: `fixtures/${fixture.id}`,
    status: 'ready',
    storageBytes: archive.archiveBytes,
    canvasWidth: 1,
    canvasHeight: 1,
    diagnosticsCount: 0,
  }
}
