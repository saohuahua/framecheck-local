import Dexie, { type Table } from 'dexie'
import type { LocalBundlePreferences, LocalBundleRecord } from '../bundle/types'

class FramecheckIndexDatabase extends Dexie {
  bundles!: Table<LocalBundleRecord, string>

  constructor() {
    super('framecheck-local')
    this.version(1).stores({
      bundles: 'localBundleId,[sourceSha256+portableSchemaVersion],importedAt,lastOpenedAt,status',
    })
  }
}

export class IndexedDbBundleIndex {
  private readonly database = new FramecheckIndexDatabase()

  async list(): Promise<LocalBundleRecord[]> {
    return this.database.bundles.orderBy('lastOpenedAt').reverse().toArray()
  }

  async get(localBundleId: string): Promise<LocalBundleRecord | undefined> {
    return this.database.bundles.get(localBundleId)
  }

  async findCacheHit(sourceSha256: string, portableSchemaVersion: string): Promise<LocalBundleRecord | undefined> {
    const record = await this.database.bundles
      .where('[sourceSha256+portableSchemaVersion]')
      .equals([sourceSha256, portableSchemaVersion])
      .first()

    return record
  }

  async put(record: LocalBundleRecord): Promise<void> {
    await this.database.bundles.put(record)
  }

  async delete(localBundleId: string): Promise<void> {
    await this.database.bundles.delete(localBundleId)
  }

  async updateOpened(localBundleId: string, timestamp: string): Promise<void> {
    await this.database.bundles.update(localBundleId, { lastOpenedAt: timestamp })
  }

  async updatePreferences(localBundleId: string, preferences: LocalBundlePreferences): Promise<void> {
    await this.database.bundles.update(localBundleId, { preferences })
  }
}

export const indexedDbBundleIndex = new IndexedDbBundleIndex()
