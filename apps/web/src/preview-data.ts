import seed from './data/preview-data.json';

export type PreviewData = typeof seed;

/**
 * Single boundary for every non-persistent preview. Replace this implementation with
 * tenant-scoped API repositories as each domain is connected to PostgreSQL.
 */
export interface PreviewDataRepository {
  snapshot(): PreviewData;
}

class JsonPreviewDataRepository implements PreviewDataRepository {
  snapshot(): PreviewData { return structuredClone(seed); }
}

export const previewDataRepository: PreviewDataRepository = new JsonPreviewDataRepository();
export const previewSeeds = previewDataRepository.snapshot();
