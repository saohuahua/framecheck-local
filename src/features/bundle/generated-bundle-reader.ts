export interface GeneratedBundleReader {
  read(jobId: string): Promise<File>
}
