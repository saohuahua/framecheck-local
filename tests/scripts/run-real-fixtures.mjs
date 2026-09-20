import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { packRealFixtures } from './pack-real-fixtures.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..', '..')
const temporaryDirectory = join(projectRoot, 'tests', '.tmp')
const manifestPath = join(projectRoot, 'tests', 'fixtures', 'real-bundles.manifest.json')
const packedPath = join(temporaryDirectory, 'packed-real-fixtures.json')
const resultsPath = join(temporaryDirectory, 'real-fixture-results.json')

await packRealFixtures()

const environment = {
  ...process.env,
  FRAMECHECK_REAL_FIXTURE_MANIFEST: manifestPath,
  FRAMECHECK_REAL_PACKED_FIXTURES: packedPath,
  FRAMECHECK_REAL_RESULTS: resultsPath,
}

await run(process.execPath, [
  join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs'),
  'run',
  'tests/integration/real-bundle-contract.spec.ts',
], environment)

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const packed = JSON.parse(await readFile(packedPath, 'utf8'))
const markerFixture = manifest.fixtures.find((fixture) => fixture.id === 'marked-assets')
if (!markerFixture?.expectation.e2eAssetLayerId) {
  throw new Error('The marked-assets fixture must declare e2eAssetLayerId')
}
const markerArchive = packed.packed.find((fixture) => fixture.id === markerFixture.id)
if (!markerArchive) {
  throw new Error('The marked-assets fixture archive was not generated')
}

await run(process.execPath, [
  join(projectRoot, 'node_modules', 'playwright', 'cli.js'),
  'test',
  'real-cli-bundle.spec.ts',
], {
  ...environment,
  FRAMECHECK_REAL_BUNDLE: markerArchive.archivePath,
  FRAMECHECK_REAL_ASSET_LAYER_ID: markerFixture.expectation.e2eAssetLayerId,
})

await run(process.execPath, [join(projectRoot, 'tests', 'scripts', 'write-v3-report.mjs')], environment)

function run(command, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(new Error(`Command failed with exit code ${code}`))
    })
  })
}
