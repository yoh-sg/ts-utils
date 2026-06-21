import type { OnResolveArgs, OnResolveOptions, OnResolveResult } from 'esbuild'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildDeployPackageJson, createRuntimeDependencyBoundaryContext, deployPackageManifestPlugin, runtimeDependenciesFromPackageJson, runtimeDependencyBoundaryPlugin, workspaceDependenciesFromPackageJson, type PackageJson, type RuntimeDependencyBoundaryContext } from '../../src/plugins/runtime-artifact'

interface MockResolverBuild {
	resolveOptions?: OnResolveOptions
	resolveCallback?: (args: OnResolveArgs) => OnResolveResult | null
	onResolve: (options: OnResolveOptions, callback: (args: OnResolveArgs) => OnResolveResult | null) => void
}

interface MockManifestBuildResult {
	errors: unknown[]
	warnings: unknown[]
}

interface MockManifestBuild {
	onEndCallback?: (result: MockManifestBuildResult) => Promise<void> | void
	onEnd: (callback: (result: MockManifestBuildResult) => Promise<void> | void) => void
}

const tempDirs: string[] = []

afterEach(async () => {
	await Promise.all(tempDirs.map((path) => rm(path, { recursive: true, force: true })))
	tempDirs.length = 0
})

describe('runtime artifact helpers', () => {
	it('splits registry runtime dependencies from workspace dependencies', () => {
		const packageJson: PackageJson = {
			dependencies: {
				'@muse/models': 'workspace:*',
				'firebase-admin': '^13.0.0',
				hono: '^4.0.0',
			},
		}

		const runtimeDependencies = runtimeDependenciesFromPackageJson(packageJson)
		const workspaceDependencies = workspaceDependenciesFromPackageJson(packageJson)

		expect(runtimeDependencies).toEqual({ 'firebase-admin': '^13.0.0', hono: '^4.0.0' })
		expect([...workspaceDependencies]).toEqual(['@muse/models'])
	})

	it('externalizes direct and discovered runtime packages while bundling internal packages', async () => {
		const workspaceRootPath: string = await createWorkspaceFixture()
		const servicePackageJson: PackageJson = {
			name: '@repo/service',
			dependencies: {
				'@repo/domain': 'workspace:*',
				'firebase-admin': '^13.0.0',
			},
		}
		const context: RuntimeDependencyBoundaryContext = createRuntimeDependencyBoundaryContext({
			workspaceRootPath,
			packageJson: servicePackageJson,
			internalPackageScopes: ['@repo'],
			errorPackageJsonPath: 'services/service/package.json',
		})
		const build = createMockResolverBuild()
		const plugin = runtimeDependencyBoundaryPlugin(context)

		plugin.setup(build as never)

		expect(resolveBareImport(build, 'node:fs', resolve(workspaceRootPath, 'services/service/src/main.ts'))).toEqual({ path: 'node:fs', external: true })
		expect(resolveBareImport(build, 'firebase-admin/app', resolve(workspaceRootPath, 'services/service/src/main.ts'))).toEqual({ path: 'firebase-admin/app', external: true })
		expect(resolveBareImport(build, '@repo/domain', resolve(workspaceRootPath, 'services/service/src/main.ts'))).toBeNull()
		expect(resolveBareImport(build, 'crawlee', resolve(workspaceRootPath, 'libs/domain/src/index.ts'))).toEqual({ path: 'crawlee', external: true })
		expect(context.runtimeDependencies).toEqual({ 'firebase-admin': '^13.0.0', crawlee: '^3.0.0' })
	})

	it('fails undeclared registry imports from bundled workspace code', async () => {
		const workspaceRootPath: string = await createWorkspaceFixture()
		const servicePackageJson: PackageJson = { name: '@repo/service', dependencies: { '@repo/domain': 'workspace:*' } }
		const context: RuntimeDependencyBoundaryContext = createRuntimeDependencyBoundaryContext({
			workspaceRootPath,
			packageJson: servicePackageJson,
			internalPackageScopes: ['@repo'],
			errorPackageJsonPath: 'services/service/package.json',
		})
		const build = createMockResolverBuild()
		const plugin = runtimeDependencyBoundaryPlugin(context)

		plugin.setup(build as never)

		expect(() => resolveBareImport(build, 'missing-package', resolve(workspaceRootPath, 'libs/domain/src/index.ts'))).toThrow('Undeclared runtime package import "missing-package"')
	})

	it('writes a generated deploy package manifest after successful builds', async () => {
		const tempDirPath: string = await mkdtemp(join(tmpdir(), 'esbuild-runtime-artifact-'))
		tempDirs.push(tempDirPath)
		const outputPath: string = join(tempDirPath, 'package.json')
		const packageJson: PackageJson = { name: '@repo/service', description: 'Repo service', version: '0.1.0', type: 'module', engines: { node: '>=22' } }
		const runtimeDependencies = { hono: '^4.0.0' }
		const build = createMockManifestBuild()
		const plugin = deployPackageManifestPlugin({ outputPath, packageJson, runtimeDependencies, main: 'main.js' })

		plugin.setup(build as never)
		await build.onEndCallback?.({ errors: [], warnings: [] })

		const writtenRaw: string = await readFile(outputPath, 'utf8')
		const written: unknown = JSON.parse(writtenRaw)
		const expected = buildDeployPackageJson({ packageJson, runtimeDependencies, main: 'main.js' })
		expect(written).toEqual(expected)
	})
})

async function createWorkspaceFixture(): Promise<string> {
	const workspaceRootPath: string = await mkdtemp(join(tmpdir(), 'esbuild-runtime-boundary-'))
	tempDirs.push(workspaceRootPath)
	await mkdir(resolve(workspaceRootPath, 'libs/domain/src'), { recursive: true })
	await mkdir(resolve(workspaceRootPath, 'services/service/src'), { recursive: true })
	const domainPackageJson: PackageJson = { name: '@repo/domain', dependencies: { crawlee: '^3.0.0' } }
	await writeFile(resolve(workspaceRootPath, 'libs/domain/package.json'), `${JSON.stringify(domainPackageJson, null, 2)}\n`, 'utf8')
	return workspaceRootPath
}

function createMockResolverBuild(): MockResolverBuild {
	const build: MockResolverBuild = {
		onResolve(options: OnResolveOptions, callback: (args: OnResolveArgs) => OnResolveResult | null): void {
			build.resolveOptions = options
			build.resolveCallback = callback
		},
	}
	return build
}

function createMockManifestBuild(): MockManifestBuild {
	const build: MockManifestBuild = {
		onEnd(callback: (result: MockManifestBuildResult) => Promise<void> | void): void {
			build.onEndCallback = callback
		},
	}
	return build
}

function resolveBareImport(build: MockResolverBuild, path: string, importer: string): OnResolveResult | null {
	if (!build.resolveCallback) throw new Error('Missing onResolve callback')
	const args: OnResolveArgs = { path, importer, namespace: 'file', resolveDir: '', kind: 'import-statement', pluginData: undefined, with: {} }
	const result: OnResolveResult | null = build.resolveCallback(args)
	return result
}
