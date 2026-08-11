import { brotliDecompressSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { brotli } from './brotli'

describe('brotli', () => {

	it('accepts an explicit compression quality while preserving decompressed content', async () => {
		const input: Buffer = Buffer.from(JSON.stringify({ hashes: Array.from({ length: 1_000 }, (_, index: number): string => `${index}-${'a'.repeat(64)}`) }))
		const qualityFour: Buffer = await brotli(input, { quality: 4 })
		const defaultQuality: Buffer = await brotli(input)

		expect(brotliDecompressSync(qualityFour)).toEqual(input)
		expect(brotliDecompressSync(defaultQuality)).toEqual(input)
		expect(qualityFour).not.toEqual(defaultQuality)
	})

})
