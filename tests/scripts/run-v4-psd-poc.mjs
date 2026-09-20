import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { packV4PocFixtures } from './pack-v4-poc-fixtures.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..', '..')
const temporaryDirectory = join(projectRoot, 'tests', '.tmp')
const manifestPath = join(projectRoot, 'tests', 'fixtures', 'browser-psd-poc.manifest.json')
const packedPath = join(temporaryDirectory, 'v4-poc-packed.json')
const resultsPath = join(temporaryDirectory, 'v4-psd-poc-results.json')

await mkdir(temporaryDirectory, { recursive: true })
await writeFile(resultsPath, JSON.stringify({ browserRuns: [] }, null, 2))
await writeFile(packedPath, JSON.stringify({ packed: [] }, null, 2))

const environment = {
  ...process.env,
  FRAMECHECK_PSD_POC_MANIFEST: manifestPath,
  FRAMECHECK_PSD_POC_PACKED: packedPath,
  FRAMECHECK_PSD_POC_RESULTS: resultsPath,
}

let testFailure
try {
  await packV4PocFixtures()
  await run(process.execPath, [
    join(projectRoot, 'node_modules', 'playwright', 'cli.js'),
    'test',
    '--config',
    'playwright.poc.config.ts',
  ], environment)
} catch (error) {
  testFailure = error
} finally {
  await run(process.execPath, [join(projectRoot, 'tests', 'scripts', 'write-v4-poc-report.mjs')], environment)
}

if (testFailure) {
  throw testFailure
}

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
