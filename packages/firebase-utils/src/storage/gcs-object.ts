import type { TimestampLike } from '../firestore/timestamp/timestamp-like'


// ------------------------------------------------------------
// Core pointer to a GCS object (immutable, versioned by path)
// ------------------------------------------------------------
export interface GcsObjectRef {
	/** When this file pointer was recorded. */
	createdAt?: TimestampLike

	/** When we last re-wrote / refreshed this pointer (e.g., re-tokenized). */
	updatedAt?: TimestampLike

	/** Bucket name. */
	bucket: string

	/** gs://bucket/path/to/file */
	filePath: string

	/** File name (without path). */
	fileName: string

	/** Compressed size in bytes (if known). */
	bytes: number

	/** HTTP ETag from GCS (for cache validation). */
	etag?: string

	/** Optional integrity hash (e.g. 'sha256:abcdef...'). */
	hash: string

	/** MIME type if you want to assert content-type (e.g. application/json). */
	contentType?: string

	/** 'br' for Brotli, 'gzip', or 'none' informative only. */
	compression?: 'br' | 'gzip' | 'none'

	/** Optional schema id for the file’s JSON shape (e.g. 'segments@1'). */
	schema?: string
}

/** GCS object pointer returned after an accepted upload, including its immutable object generation. */
export interface UploadedGcsObjectRef extends GcsObjectRef {
	/** Exact GCS generation accepted by the completed upload. */
	generation: string
}
