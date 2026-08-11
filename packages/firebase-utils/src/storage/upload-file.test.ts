import { describe, expect, it, vi } from 'vitest'

import type { Bucket, File, SaveOptions } from './types'
import type { UploadedGcsObjectRef } from './gcs-object'
import { uploadFile } from './upload-file'

interface UploadFileFixture {
	bucket: Bucket
	file: File
	save: ReturnType<typeof vi.fn>
}

describe('uploadFile', () => {

	it('passes generation preconditions and returns the accepted generation', async () => {
		const fixture: UploadFileFixture = uploadFileFixture('42')
		const preconditionOpts: NonNullable<SaveOptions>['preconditionOpts'] = { ifGenerationMatch: 0 }
		const result: UploadedGcsObjectRef = await uploadFile(fixture.bucket, 'analytics/ig', 'current', 'json', Buffer.from('{}'), { preconditionOpts })

		expect(fixture.save).toHaveBeenCalledOnce()
		const saveOptions: SaveOptions = fixture.save.mock.calls[0]?.[1] as SaveOptions
		expect(saveOptions?.preconditionOpts).toEqual({ ifGenerationMatch: 0 })
		expect(result.generation).toBe('42')
		expect(result.filePath).toBe('analytics/ig/current.json')
	})

	it('preserves gzip naming and metadata', async () => {
		const fixture: UploadFileFixture = uploadFileFixture('43')
		const result: UploadedGcsObjectRef = await uploadFile(fixture.bucket, 'analytics/ig', 'current', 'json', Buffer.from('{}'), {
			compression: 'gzip',
			metadata: { contentType: 'application/json', cacheControl: 'no-store' }
		})

		const saveOptions: SaveOptions = fixture.save.mock.calls[0]?.[1] as SaveOptions
		expect(saveOptions?.metadata).toEqual({ contentType: 'application/json', contentEncoding: 'gzip', cacheControl: 'no-store' })
		expect(result.fileName).toBe('current.json.gz')
		expect(result.compression).toBe('gzip')
	})

	it('uploads Brotli data with explicit compression tuning', async () => {
		const fixture: UploadFileFixture = uploadFileFixture('44')
		const input: Buffer = Buffer.from(JSON.stringify({ hashes: Array.from({ length: 100 }, (_, index: number): string => `${index}-${'a'.repeat(64)}`) }))
		const result: UploadedGcsObjectRef = await uploadFile(fixture.bucket, 'analytics/ig', 'current', 'json', input, {
			compression: 'br',
			brotliOptions: { quality: 4 },
			metadata: { contentType: 'application/json', cacheControl: 'no-store' }
		})

		const compressed: Buffer = fixture.save.mock.calls[0]?.[0] as Buffer
		const saveOptions: SaveOptions = fixture.save.mock.calls[0]?.[1] as SaveOptions
		expect(compressed).not.toEqual(input)
		expect(saveOptions?.metadata).toEqual({ contentType: 'application/json', contentEncoding: 'br', cacheControl: 'no-store' })
		expect(result.fileName).toBe('current.json.br')
		expect(result.compression).toBe('br')
	})

	it('fails when the accepted upload response has no generation', async () => {
		const fixture: UploadFileFixture = uploadFileFixture(undefined)
		await expect(uploadFile(fixture.bucket, 'analytics/ig', 'current', 'json', '{}')).rejects.toThrow('Missing GCS generation after uploading analytics/ig/current.json')
	})

})

function uploadFileFixture(generation: string | undefined): UploadFileFixture {
	const save = vi.fn(async () => undefined)
	const file: Partial<File> = {
		metadata: generation ? { generation } : {},
		save
	}
	const bucket: Partial<Bucket> = {
		name: 'test-bucket',
		file: vi.fn(() => file as File)
	}
	const fixture: UploadFileFixture = { bucket: bucket as Bucket, file: file as File, save }
	return fixture
}
