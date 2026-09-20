import type {
  PsdHeaderSummary,
  PsdPocFailureCode,
  PsdPocLimits,
  PsdPreflightSummary,
} from './psd-preflight'

export type PsdPocStage = 'header' | 'structure' | 'preview'

export interface PsdPocMemorySample {
  bytes: number | null
  label: 'after-buffer' | 'after-header' | 'after-preview' | 'after-structure'
}

export interface PsdPocMarkerCandidate {
  count: number
  marker: '-h-' | '-s-' | '-slice-'
  names: string[]
}

export interface PsdPocStructureSummary {
  effectLayerCount: number
  groupCount: number
  layerCount: number
  layerNames: string[]
  markerCandidates: PsdPocMarkerCandidate[]
  smartObjectLayerCount: number
  textLayerCount: number
}

export interface PsdPocPreviewSummary {
  height: number
  pixelBytes: number
  sampledChecksum: string
  status: 'decoded'
  width: number
}

export interface PsdPocReport {
  durationMs: number
  file: {
    name: string
    size: number
  }
  header: PsdHeaderSummary
  limits: PsdPocLimits
  memory: {
    method: 'performance.memory' | 'unavailable'
    samples: PsdPocMemorySample[]
    sampledPeakBytes: number | null
  }
  preflight: PsdPreflightSummary
  preview: PsdPocPreviewSummary
  storage: {
    staging: 'not-created'
  }
  structure: PsdPocStructureSummary
}

export interface PsdPocFailure {
  code: PsdPocFailureCode
  message: string
  stage: PsdPocStage | 'setup'
}

export interface PsdPocFailureReport {
  durationMs: number
  file: {
    name: string
    size: number
  }
  header?: PsdHeaderSummary
  memory: {
    method: 'performance.memory' | 'unavailable'
    samples: PsdPocMemorySample[]
    sampledPeakBytes: number | null
  }
  preflight?: PsdPreflightSummary
  storage: {
    staging: 'not-created'
  }
}

export type PsdPocWorkerRequest =
  | {
      file: File
      jobId: string
      limits: PsdPocLimits
      type: 'start'
    }
  | {
      jobId: string
      type: 'cancel'
    }

export type PsdPocWorkerResponse =
  | {
      headerBytes: ArrayBuffer
      jobId: string
      preflight: PsdPreflightSummary
      type: 'preflight'
    }
  | {
      jobId: string
      message: string
      stage: PsdPocStage
      type: 'progress'
    }
  | {
      jobId: string
      report: PsdPocReport
      type: 'complete'
    }
  | {
      failure: PsdPocFailure
      jobId: string
      report: PsdPocFailureReport
      type: 'failed'
    }
  | {
      jobId: string
      report: PsdPocFailureReport
      type: 'cancelled'
    }
