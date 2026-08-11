import { brotliCompress, type BrotliOptions, constants } from 'node:zlib'

export interface BrotliCompressionOptions {
	quality?: number
}

// brotli compression (promisified wrapper)
export async function brotli(buffer: Buffer, compressionOptions: BrotliCompressionOptions = {}): Promise<Buffer> {
	const quality: number = compressionOptions.quality ?? 11
	const options: BrotliOptions = {
		params: {
			[constants.BROTLI_PARAM_QUALITY]: quality,
			[constants.BROTLI_PARAM_LGWIN]: 22
		}
	}

	const result: Buffer = await new Promise<Buffer>((resolve, reject) => {
		brotliCompress(buffer, options, (error: Error | null, compressed: Buffer) => {
			if (error) {
				reject(error)
				return
			}
			resolve(compressed)
		})
	})
	return result
}
