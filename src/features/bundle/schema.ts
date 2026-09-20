import { z } from 'zod'
import { BundleError, portableBundleKind, portableBundleSchemaVersion } from './types'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, '必须是 SHA-256 十六进制值')

const dimensionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
})

const sourceSchema = z.object({
  path: z.string().min(1).optional(),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: sha256Schema,
}).passthrough()

const artifactPathsSchema = z.object({
  reference: z.literal('reference.png'),
  design: z.literal('design.json'),
  assets: z.literal('assets.json'),
  diagnostics: z.literal('diagnostics.json'),
}).strict()

export const portableBundleSchema = z.object({
  schemaVersion: z.literal(portableBundleSchemaVersion),
  kind: z.literal(portableBundleKind),
  source: z.object({
    name: z.string().min(1),
    size: z.number().int().nonnegative(),
    sha256: sha256Schema,
  }).strict(),
  artifacts: artifactPathsSchema,
  stats: z.object({
    nodes: z.number().int().nonnegative(),
    marked: z.number().int().nonnegative(),
    exported: z.number().int().nonnegative(),
    uniqueAssets: z.number().int().nonnegative(),
  }).strict(),
}).strict()

const designNodeSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  order: z.number(),
  name: z.string(),
  path: z.string(),
  kind: z.string().min(1),
  sourceKind: z.string().optional(),
  opacity: z.number().optional(),
  blendMode: z.string().optional(),
  logicalBounds: dimensionSchema,
  paintBounds: dimensionSchema.nullable().optional(),
  text: z.object({
    content: z.string(),
    style: z.object({
      font_size: z.number().optional(),
      leading: z.number().optional(),
      font_ps_name: z.string().optional(),
      font_family: z.string().optional(),
      font_weight: z.number().optional(),
      letter_spacing: z.number().optional(),
      color: z.string().optional(),
      text_align: z.string().optional(),
    }).passthrough().optional(),
  }).passthrough().nullable().optional(),
  export: z.object({
    marked: z.boolean(),
    marker: z.string().optional(),
    mode: z.string().optional(),
  }).passthrough().nullable().optional(),
  children: z.array(z.string()).optional(),
}).passthrough()

export const designSnapshotSchema = z.object({
  schemaVersion: z.string().min(1),
  source: sourceSchema,
  document: z.object({
    name: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).passthrough(),
  rootIds: z.array(z.string()),
  nodes: z.array(designNodeSchema),
  reference: z.literal('reference.png'),
  stats: z.object({
    nodes: z.number().int().nonnegative(),
  }).passthrough(),
  diagnostics: z.array(z.object({}).passthrough()),
}).passthrough()

const assetFileSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  format: z.string().min(1),
  pixelSize: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  sha256: sha256Schema,
  bytes: z.number().int().nonnegative(),
  logicalSize: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  files: z.record(z.string(), z.string()),
}).passthrough()

export const assetManifestSchema = z.object({
  schemaVersion: z.string().min(1),
  source: sourceSchema,
  assets: z.array(assetFileSchema),
  placements: z.array(z.object({
    id: z.string().min(1),
    nodeId: z.string().min(1),
    assetId: z.string().min(1),
    marker: z.string().optional(),
    mode: z.string().optional(),
    frame: dimensionSchema.optional(),
    logicalBounds: dimensionSchema.optional(),
    density: z.number().positive().optional(),
    lineageId: z.string().optional(),
  }).passthrough()),
  lineage: z.array(z.object({
    id: z.string().min(1),
    operation: z.string().optional(),
    inputNodeIds: z.array(z.string()).optional(),
    outputPlacementId: z.string().optional(),
  }).passthrough()),
  stats: z.object({
    marked: z.number().int().nonnegative(),
    exported: z.number().int().nonnegative(),
    uniqueAssets: z.number().int().nonnegative(),
  }).passthrough(),
  diagnostics: z.array(z.object({}).passthrough()),
}).passthrough()

export const diagnosticsSchema = z.object({
  schemaVersion: z.literal(portableBundleSchemaVersion),
  design: z.array(z.object({}).passthrough()),
  assets: z.array(z.object({}).passthrough()),
}).passthrough()

export type PortableBundleManifest = z.infer<typeof portableBundleSchema>
export type DesignSnapshot = z.infer<typeof designSnapshotSchema>
export type AssetManifest = z.infer<typeof assetManifestSchema>
export type DiagnosticsPayload = z.infer<typeof diagnosticsSchema>

export interface ValidatedPortableBundle {
  bundle: PortableBundleManifest
  design: DesignSnapshot
  assets: AssetManifest
  diagnostics: DiagnosticsPayload
}

function parseJsonArtifact(name: string, raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    throw new BundleError('invalid-schema', `${name} 不是有效 JSON`)
  }
}

function zodError(name: string, cause: z.ZodError) {
  const issue = cause.issues[0]
  const path = issue?.path.length ? ` ${issue.path.join('.')}` : ''
  return new BundleError('invalid-schema', `${name}${path} 校验失败`)
}

export function parsePortableBundleArtifacts(input: {
  bundle: string
  design: string
  assets: string
  diagnostics: string
}): ValidatedPortableBundle {
  const bundle = portableBundleSchema.safeParse(parseJsonArtifact('bundle.json', input.bundle))
  if (!bundle.success) {
    throw zodError('bundle.json', bundle.error)
  }

  const design = designSnapshotSchema.safeParse(parseJsonArtifact('design.json', input.design))
  if (!design.success) {
    throw zodError('design.json', design.error)
  }

  const assets = assetManifestSchema.safeParse(parseJsonArtifact('assets.json', input.assets))
  if (!assets.success) {
    throw zodError('assets.json', assets.error)
  }

  const diagnostics = diagnosticsSchema.safeParse(parseJsonArtifact('diagnostics.json', input.diagnostics))
  if (!diagnostics.success) {
    throw zodError('diagnostics.json', diagnostics.error)
  }

  if (design.data.source.sha256 !== bundle.data.source.sha256 || assets.data.source.sha256 !== bundle.data.source.sha256) {
    throw new BundleError('invalid-reference', '设计事实与资源清单的来源哈希不一致')
  }

  if (design.data.reference !== bundle.data.artifacts.reference) {
    throw new BundleError('invalid-reference', 'design.json 的 reference 与 bundle.json 不一致')
  }

  if (diagnostics.data.schemaVersion !== bundle.data.schemaVersion) {
    throw new BundleError('invalid-reference', 'diagnostics.json 的 schema 版本不一致')
  }

  return {
    bundle: bundle.data,
    design: design.data,
    assets: assets.data,
    diagnostics: diagnostics.data,
  }
}
