// Firebase
import { Timestamp } from 'firebase-admin/firestore'
import type { Bucket, SaveOptions } from './types'
export type SaveData = string | Buffer //| Uint8Array

import type { GcsObjectRef } from './gcs-object'
import { sha256 } from '@yohs/node-utils/crypto'
import { brotli, gzip } from '@yohs/node-utils/zlib'


export interface UploadFileMetadata {
	contentType?: string
	cacheControl?: string
	customMetadata?: Record<string, string>
}

export type UploadFileCompression = boolean | 'br' | 'gzip' | 'none'

export interface UploadFileOptions {
	compression?: UploadFileCompression
	hashedName?: boolean
	metadata?: UploadFileMetadata
	public?: boolean
}

// Cloud Storage upload helper with optional pre-processing (Brotli compression, SHA-256 hash)
export async function uploadFile(bucket: Bucket, fileDir: string, fileName: string, fileExtension: string, data: SaveData, options: UploadFileOptions = {}): Promise<GcsObjectRef> {
	// options merging
	let defaultOptions: UploadFileOptions = { compression: false, public: false, hashedName: false }
	const opts: UploadFileOptions = { ...defaultOptions, ...options }
	const compression: GcsObjectRef['compression'] = normalizeUploadFileCompression(opts.compression)

	// data processing
	let d: SaveData = data
	if (compression === 'br' && d instanceof Buffer) {
		d = await brotli(d)
	}
	if (compression === 'gzip' && d instanceof Buffer) {
		d = await gzip(d)
	}

	// hashing
	const hash: string = sha256(d)

	// file path (depends on compression & hashing options)
	const fileNameAdjusted: string = opts.hashedName ? `${fileName}.${hash.slice(0, 8)}.${fileExtension}` : `${fileName}.${fileExtension}`
	const fileNameWithCompression: string = addCompressionSuffix(fileNameAdjusted, compression)
	const filePath: string = `${fileDir}/${fileNameWithCompression}`
	const file = bucket.file(filePath)

	// file upload (non-streamed)
	const saveOptions: SaveOptions = {
		resumable: false,
		validation: 'crc32c',	// integrity check
		// preconditionOpts: { ifGenerationMatch: 0 },	// only create if not already present
		metadata: {
			...(opts.metadata?.contentType ? { contentType: opts.metadata.contentType } : {}),
			...(compression !== 'none' ? { contentEncoding: compression } : {}),
			...(opts.metadata?.cacheControl ? { cacheControl: opts.metadata.cacheControl } : {}),
			...(opts.metadata?.customMetadata ? { metadata: opts.metadata.customMetadata } : {})
		}
	}
	await file.save(d, saveOptions)

	// make file public (if requested)
	if (opts.public) await file.makePublic()

	// GCS object metadata
	const ref: GcsObjectRef = {
		createdAt: Timestamp.now(),
		bucket: bucket.name,
		filePath: filePath,
		fileName: fileNameWithCompression,
		bytes: (d instanceof Buffer) ? d.byteLength : d.length,
		hash: `sha256:${hash}`,
		...(opts.metadata?.contentType ? { contentType: opts.metadata.contentType } : {}),
		compression
	}

	return ref
}

function normalizeUploadFileCompression(compression: UploadFileCompression | undefined): GcsObjectRef['compression'] {
	if (compression === true) return 'br'
	if (compression === 'br') return 'br'
	if (compression === 'gzip') return 'gzip'
	const normalized: GcsObjectRef['compression'] = 'none'
	return normalized
}

function addCompressionSuffix(fileName: string, compression: GcsObjectRef['compression']): string {
	if (compression === 'br') return `${fileName}.br`
	if (compression === 'gzip') return `${fileName}.gz`
	return fileName
}
