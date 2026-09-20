export const portableBundleSchemaVersion = '1.0.0'
export const portableBundleKind = 'psd-design-bundle'

export const requiredArtifactPaths = [
  'bundle.json',
  'design.json',
  'reference.png',
  'assets.json',
  'diagnostics.json',
] as const

export type PersistedBundleStatus = 'ready' | 'partial'

export type ImportStatus =
  | 'idle'
  | 'importing'
  | 'ready'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'cache-hit'
  | 'storage-full'

export interface LocalBundlePreferences {
  viewerLayoutVersion?: 2
  lastScale?: number
  lastSelectedLayerId?: string
  leftTab?: 'files' | 'development' | 'layers'
  rightTab?: 'annotation' | 'assets' | 'properties' | 'diagnostics'
}

export interface LocalBundleRecord {
  localBundleId: string
  importedAt: string
  archiveName: string
  archiveSize: number
  sourceSha256: string
  portableSchemaVersion: string
  storagePrefix: string
  status: PersistedBundleStatus
  storageBytes: number
  canvasWidth: number
  canvasHeight: number
  diagnosticsCount: number
  lastOpenedAt?: string
  preferences?: LocalBundlePreferences
}

export interface PortableBundleSummary {
  archiveName: string
  archiveSize: number
  sourceName: string
  sourceSha256: string
  portableSchemaVersion: string
  status: PersistedBundleStatus
  storageBytes: number
  canvasWidth: number
  canvasHeight: number
  diagnosticsCount: number
  assetPaths: string[]
}

export interface BundleImportProgress {
  status: ImportStatus
  stage?: 'checking' | 'validating' | 'extracting' | 'committing'
  completed?: number
  total?: number
  message?: string
  record?: LocalBundleRecord
}

export type BundleErrorCode =
  | 'invalid-archive'
  | 'invalid-schema'
  | 'missing-artifact'
  | 'unsafe-path'
  | 'invalid-reference'
  | 'storage-full'
  | 'cancelled'
  | 'unsupported-browser'
  | 'storage-failed'

export class BundleError extends Error {
  readonly code: BundleErrorCode

  constructor(
    code: BundleErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'BundleError'
    this.code = code
  }
}

export interface StoredBundleArtifacts {
  bundle: unknown
  design: unknown
  assets: unknown
  diagnostics: unknown
  reference: File
}
