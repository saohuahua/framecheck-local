import { BundleError } from '../bundle/types'

export interface StorageEstimate {
  quota?: number
  usage?: number
}

export class StorageManager {
  async requestPersistence(): Promise<boolean | undefined> {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') {
      return undefined
    }

    return navigator.storage.persist()
  }

  async estimate(): Promise<StorageEstimate> {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') {
      return {}
    }

    return navigator.storage.estimate()
  }

  async ensureAvailable(requiredBytes: number): Promise<void> {
    const { quota, usage } = await this.estimate()
    if (quota === undefined || usage === undefined) {
      return
    }

    if (quota - usage < requiredBytes) {
      throw new BundleError('storage-full', '本地可用空间不足，未写入 Bundle')
    }
  }
}

export const storageManager = new StorageManager()
