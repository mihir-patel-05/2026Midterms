/**
 * Where raw provider documents are kept, by content hash. On election night they went to the api container's
 * disk, which has no volume on Railway, so every redeploy lost them (#136). With `RESULTS_ARTIFACT_BUCKET` set
 * they go to an S3-compatible bucket (the Railway `db-backups` bucket) under `raw/civicapi/`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface ArtifactStore {
  /** For logs: where documents go. Never includes a credential. */
  readonly describe: string;
  /** Stores one gzipped document under a content-addressed name; returns the `storageKey` to record. Idempotent. */
  put(name: string, gzipped: Buffer): Promise<string>;
}

export function diskArtifactStore(dir: string): ArtifactStore {
  return {
    describe: `disk ${dir}`,
    async put(name, gzipped) {
      const path = join(dir, name);
      await mkdir(dirname(path), { recursive: true });
      try {
        await writeFile(path, gzipped, { flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      return `volume:${name}`;
    },
  };
}

export interface BucketSettings {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Key prefix, without slashes at the ends: `raw/civicapi`. */
  prefix: string;
  /** Path-style URLs, for S3 emulators in tests; Railway buckets use virtual-hosted URLs. */
  forcePathStyle?: boolean;
}

export function bucketArtifactStore(settings: BucketSettings, client?: S3Client): ArtifactStore {
  const s3 = client ?? new S3Client({
    endpoint: settings.endpoint,
    region: settings.region || 'auto',
    forcePathStyle: settings.forcePathStyle ?? false,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  });
  const prefix = settings.prefix.replace(/^\/+|\/+$/g, '');
  return {
    describe: `bucket ${settings.bucket}/${prefix}`,
    async put(name, gzipped) {
      const key = `${prefix}/${name}`;
      // Content-addressed, so writing the same document twice stores the same bytes.
      await s3.send(new PutObjectCommand({ Bucket: settings.bucket, Key: key, Body: gzipped, ContentType: 'application/json', ContentEncoding: 'gzip' }));
      return `bucket:${key}`;
    },
  };
}

/** The bucket store when every bucket setting is present; null otherwise (documents then go to disk). */
export function artifactStoreFromSettings(settings: Partial<BucketSettings>): ArtifactStore | null {
  const { bucket, endpoint, accessKeyId, secretAccessKey } = settings;
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return bucketArtifactStore({ bucket, endpoint, accessKeyId, secretAccessKey, region: settings.region ?? 'auto', prefix: settings.prefix ?? 'raw/civicapi', forcePathStyle: settings.forcePathStyle });
}
