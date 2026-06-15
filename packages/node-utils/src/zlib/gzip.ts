import { gzip as gzipCompress } from 'node:zlib'

// gzip compression (promisified wrapper)
export async function gzip(buffer: Buffer): Promise<Buffer> {
	const result: Buffer = await new Promise<Buffer>((resolve, reject) =>
		gzipCompress(buffer, (error: Error | null, compressed: Buffer) => {
			if (error) reject(error)
			resolve(compressed)
		})
	)
	return result
}
