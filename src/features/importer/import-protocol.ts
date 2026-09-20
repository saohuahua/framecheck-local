import type { BundleErrorCode, PortableBundleSummary } from '../bundle/types'

export type ImportWorkerRequest =
  | {
      type: 'prepare'
      jobId: string
      file: File
    }
  | {
      type: 'extract'
      jobId: string
      stagingPrefix: string
    }
  | {
      type: 'cancel'
      jobId: string
    }

export type ImportWorkerResponse =
  | {
      type: 'progress'
      jobId: string
      stage: 'checking' | 'validating' | 'extracting'
      completed: number
      total: number
      message: string
    }
  | {
      type: 'validated'
      jobId: string
      summary: PortableBundleSummary
    }
  | {
      type: 'extracted'
      jobId: string
    }
  | {
      type: 'cancelled'
      jobId: string
    }
  | {
      type: 'failed'
      jobId: string
      error: {
        code: BundleErrorCode
        message: string
      }
    }
