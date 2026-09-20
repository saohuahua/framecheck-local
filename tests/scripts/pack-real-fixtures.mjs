import { readFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..', '..')
const manifestPath = join(projectRoot, 'tests', 'fixtures', 'real-bundles.manifest.json')
const outputPath = join(projectRoot, 'tests', '.tmp', 'packed-real-fixtures.json')

export async function packRealFixtures() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const packed = []

  for (const fixture of manifest.fixtures) {
    const outputDirectory = resolve(projectRoot, fixture.outputDirectory)
    await mkdir(outputDirectory, { recursive: true })
    await run(manifest.cli.python, [
      manifest.cli.entry,
      'pack',
      fixture.sourcePath,
      '-o',
      outputDirectory,
      '--scales',
      '1',
    ])

    const archiveName = `${basename(fixture.sourcePath, extname(fixture.sourcePath))}.psd-bundle.zip`
    const archivePath = join(outputDirectory, archiveName)
    const archive = await stat(archivePath)
    packed.push({
      id: fixture.id,
      archivePath,
      archiveBytes: archive.size,
    })
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify({ manifestPath, packed }, null, 2))
  return { manifestPath, packed }
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(new Error(`Fixture pack failed with exit code ${code}`))
    })
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  packRealFixtures()
    .then(({ packed }) => console.log(JSON.stringify({ packed }, null, 2)))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
