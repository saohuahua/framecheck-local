import type { Entry } from '@zip.js/zip.js'
import { BundleError, requiredArtifactPaths } from './types'
import type { AssetManifest, ValidatedPortableBundle } from './schema'

export const bundleImportLimits = {
  maxArchiveBytes: 512 * 1024 * 1024,
  maxEntryBytes: 256 * 1024 * 1024,
  maxUncompressedBytes: 512 * 1024 * 1024,
  maxEntries: 10_000,
}

export interface ArchiveEntryMeta {
  filename: string
  directory: boolean
  symlink: boolean
  encrypted: boolean
  compressedSize: number
  uncompressedSize: number
}

export interface ValidatedArchiveLayout {
  artifactPaths: string[]
  storageBytes: number
}

export function assertSafeArchivePath(value: string, allowDirectory = false): string {
  const path = allowDirectory && value.endsWith('/') ? value.slice(0, -1) : value
  const segments = path.split('/')
  const unsafe =
    !path ||
    value.includes('\\') ||
    value.includes('\0') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')

  if (unsafe) {
    throw new BundleError('unsafe-path', `ZIP 包含不安全路径 ${value}`)
  }

  return path
}

export function validateArchiveEntries(entries: ArchiveEntryMeta[], archiveSize: number): number {
  if (archiveSize > bundleImportLimits.maxArchiveBytes) {
    throw new BundleError('invalid-archive', 'Bundle 压缩包超过 V1 本地导入上限')
  }

  if (entries.length > bundleImportLimits.maxEntries) {
    throw new BundleError('invalid-archive', 'Bundle 包含过多文件')
  }

  const files = new Set<string>()
  let totalBytes = 0

  for (const entry of entries) {
    const path = assertSafeArchivePath(entry.filename, entry.directory)
    if (entry.symlink || entry.encrypted) {
      throw new BundleError('invalid-archive', `ZIP 条目不受支持 ${entry.filename}`)
    }

    if (entry.directory) {
      if (path !== 'assets') {
        throw new BundleError('unsafe-path', `ZIP 包含不允许的目录 ${entry.filename}`)
      }
      continue
    }

    if (files.has(path)) {
      throw new BundleError('unsafe-path', `ZIP 包含重复文件 ${path}`)
    }

    if (!requiredArtifactPaths.includes(path as (typeof requiredArtifactPaths)[number]) && !path.startsWith('assets/')) {
      throw new BundleError('unsafe-path', `ZIP 包含不允许的工件 ${path}`)
    }

    if (!Number.isFinite(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > bundleImportLimits.maxEntryBytes) {
      throw new BundleError('invalid-archive', `ZIP 条目大小无效 ${path}`)
    }

    totalBytes += entry.uncompressedSize
    files.add(path)
  }

  if (totalBytes > bundleImportLimits.maxUncompressedBytes) {
    throw new BundleError('invalid-archive', 'Bundle 解压后超过 V1 本地缓存上限')
  }

  for (const requiredPath of requiredArtifactPaths) {
    if (!files.has(requiredPath)) {
      throw new BundleError('missing-artifact', `Bundle 缺少必需工件 ${requiredPath}`)
    }
  }

  return totalBytes
}

export function validateAssetReferences(
  assets: AssetManifest,
  archivePaths: Set<string>,
): string[] {
  const assetPaths = new Set<string>()

  for (const asset of assets.assets) {
    const paths = [asset.file, ...Object.values(asset.files)]
    for (const value of paths) {
      const path = assertSafeArchivePath(value)
      if (!path.startsWith('assets/')) {
        throw new BundleError('invalid-reference', `资源引用不在 assets 目录 ${path}`)
      }
      if (!archivePaths.has(path)) {
        throw new BundleError('missing-artifact', `资源文件不存在 ${path}`)
      }
      assetPaths.add(path)
    }
  }

  return [...assetPaths].sort()
}

export function resolveBundleStatus(bundle: ValidatedPortableBundle): 'ready' | 'partial' {
  const hasExportGap = bundle.bundle.stats.exported < bundle.bundle.stats.marked
  const hasError = [...bundle.diagnostics.design, ...bundle.diagnostics.assets].some((diagnostic) => {
    if (!('severity' in diagnostic)) {
      return false
    }

    return diagnostic.severity === 'error'
  })

  return hasExportGap || hasError ? 'partial' : 'ready'
}

export function toArchiveEntryMeta(entry: Entry): ArchiveEntryMeta {
  return {
    filename: entry.filename,
    directory: entry.directory,
    symlink: entry.symlink,
    encrypted: entry.encrypted,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
  }
}
