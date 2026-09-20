function pathSegments(value: string): string[] {
  const segments = value.split('/')
  if (
    !value ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`不安全的本地存储路径 ${value}`)
  }

  return segments
}

async function directoryAt(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let directory = root
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create })
  }
  return directory
}

async function resolveParent(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<{ directory: FileSystemDirectoryHandle; filename: string }> {
  const segments = pathSegments(path)
  const filename = segments.pop()
  if (!filename) {
    throw new Error(`缺少本地文件名 ${path}`)
  }

  return {
    directory: await directoryAt(root, segments, create),
    filename,
  }
}

async function copyDirectory(
  source: FileSystemDirectoryHandle,
  destination: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, handle] of source.entries()) {
    if (handle.kind === 'directory') {
      const child = await destination.getDirectoryHandle(name, { create: true })
      await copyDirectory(handle, child)
      continue
    }

    const sourceFile = await handle.getFile()
    const destinationFile = await destination.getFileHandle(name, { create: true })
    const writable = await destinationFile.createWritable()
    await sourceFile.stream().pipeTo(writable)
  }
}

export class OpfsBundleStore {
  async isSupported(): Promise<boolean> {
    return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'
  }

  async createWritable(prefix: string, path: string): Promise<FileSystemWritableFileStream> {
    const root = await this.root()
    const { directory, filename } = await resolveParent(root, `${prefix}/${path}`, true)
    const file = await directory.getFileHandle(filename, { create: true })
    return file.createWritable()
  }

  async readFile(prefix: string, path: string): Promise<File> {
    const root = await this.root()
    const { directory, filename } = await resolveParent(root, `${prefix}/${path}`, false)
    const file = await directory.getFileHandle(filename)
    return file.getFile()
  }

  async listFiles(prefix: string): Promise<string[]> {
    const root = await this.root()
    const directory = await directoryAt(root, pathSegments(prefix), false)
    const files: string[] = []

    async function walk(current: FileSystemDirectoryHandle, parent: string) {
      for await (const [name, handle] of current.entries()) {
        const relativePath = parent ? `${parent}/${name}` : name
        if (handle.kind === 'directory') {
          await walk(handle, relativePath)
        } else {
          files.push(relativePath)
        }
      }
    }

    await walk(directory, '')
    return files.sort()
  }

  async commitStaging(stagingPrefix: string, storagePrefix: string): Promise<void> {
    const root = await this.root()
    const staging = await directoryAt(root, pathSegments(stagingPrefix), false)

    await this.deletePrefix(storagePrefix)
    try {
      const destination = await directoryAt(root, pathSegments(storagePrefix), true)
      await copyDirectory(staging, destination)
      await this.deletePrefix(stagingPrefix)
    } catch (error) {
      await this.deletePrefix(storagePrefix)
      await this.deletePrefix(stagingPrefix)
      throw error
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    const root = await this.root()
    const segments = pathSegments(prefix)
    const name = segments.pop()
    if (!name) {
      return
    }

    try {
      const parent = await directoryAt(root, segments, false)
      await parent.removeEntry(name, { recursive: true })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return
      }
      throw error
    }
  }

  private async root(): Promise<FileSystemDirectoryHandle> {
    if (!(await this.isSupported())) {
      throw new Error('当前浏览器不支持 OPFS')
    }

    return navigator.storage.getDirectory()
  }
}

export const opfsBundleStore = new OpfsBundleStore()
