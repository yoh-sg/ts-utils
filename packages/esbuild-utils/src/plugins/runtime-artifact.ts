import type { OnResolveArgs, OnResolveOptions, OnResolveResult, Plugin, PluginBuild } from 'esbuild'
import { existsSync, readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { dirname, resolve } from 'node:path'

export interface PackageJson {
	name?: string
	description?: string
	author?: string
	version?: string
	private?: boolean
	type?: string
	engines?: Record<string, string>
	dependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
	optionalDependencies?: Record<string, string>
}

export interface RuntimeDependencies {
	[dependencyName: string]: string
}

export interface RuntimeDependencyBoundaryContext {
	workspaceRootPath: string
	runtimeDependencies: RuntimeDependencies
	workspaceDependencies: Set<string>
	fallbackPackageJson: PackageJson
	packageJsonCache: Map<string, PackageJson>
	internalPackageScopes: string[]
	errorPackageJsonPath: string
}

export interface RuntimeDependencyBoundaryContextOptions {
	workspaceRootPath: string
	packageJson: PackageJson
	runtimeDependencies?: RuntimeDependencies
	workspaceDependencies?: Set<string>
	packageJsonCache?: Map<string, PackageJson>
	internalPackageScopes?: string[]
	errorPackageJsonPath?: string
}

export interface DeployPackageJson {
	name?: string
	description: string
	author?: string
	version?: string
	private: true
	type: string
	main: string
	engines?: Record<string, string>
	dependencies: RuntimeDependencies
}

export interface DeployPackageJsonOptions {
	packageJson: PackageJson
	runtimeDependencies: RuntimeDependencies
	main: string
	description?: string
}

export interface DeployPackageManifestPluginOptions extends DeployPackageJsonOptions {
	outputPath: string
}

export async function readPackageJson(packageJsonPath: string): Promise<PackageJson> {
	const packageJsonRaw: string = await readFile(packageJsonPath, 'utf8')
	const packageJson: PackageJson = JSON.parse(packageJsonRaw) as PackageJson
	return packageJson
}

export function createRuntimeDependencyBoundaryContext(options: RuntimeDependencyBoundaryContextOptions): RuntimeDependencyBoundaryContext {
	const runtimeDependencies: RuntimeDependencies = options.runtimeDependencies ?? runtimeDependenciesFromPackageJson(options.packageJson)
	const workspaceDependencies: Set<string> = options.workspaceDependencies ?? workspaceDependenciesFromPackageJson(options.packageJson)
	const packageJsonCache: Map<string, PackageJson> = options.packageJsonCache ?? new Map<string, PackageJson>()
	const internalPackageScopes: string[] = options.internalPackageScopes ?? []
	const errorPackageJsonPath: string = options.errorPackageJsonPath ?? 'package.json'
	const context: RuntimeDependencyBoundaryContext = {
		workspaceRootPath: options.workspaceRootPath,
		runtimeDependencies,
		workspaceDependencies,
		fallbackPackageJson: options.packageJson,
		packageJsonCache,
		internalPackageScopes,
		errorPackageJsonPath,
	}
	return context
}

export function runtimeDependenciesFromPackageJson(packageJson: PackageJson): RuntimeDependencies {
	const dependencies: RuntimeDependencies = {}
	for (const [dependencyName, version] of Object.entries(packageJson.dependencies ?? {})) {
		if (isWorkspaceDependencySpec(version)) continue
		assertSupportedRuntimeDependencySpec(dependencyName, version)
		dependencies[dependencyName] = version
	}
	return dependencies
}

export function workspaceDependenciesFromPackageJson(packageJson: PackageJson): Set<string> {
	const dependencyNames: string[] = []
	for (const [dependencyName, version] of Object.entries(packageJson.dependencies ?? {})) {
		if (isWorkspaceDependencySpec(version)) dependencyNames.push(dependencyName)
	}
	const workspaceDependencies: Set<string> = new Set<string>(dependencyNames)
	return workspaceDependencies
}

export function runtimeDependencyBoundaryPlugin(context: RuntimeDependencyBoundaryContext): Plugin {
	const runtimeDependencyNames: Set<string> = new Set<string>(Object.keys(context.runtimeDependencies))
	const plugin: Plugin = {
		name: 'runtime-dependency-boundary',
		setup(build: PluginBuild): void {
			const onResolveOptions: OnResolveOptions = { filter: /^[^./]/ }
			build.onResolve(onResolveOptions, (args: OnResolveArgs): OnResolveResult | null => {
				const result: OnResolveResult | null = resolveRuntimeDependency(context, runtimeDependencyNames, args)
				return result
			})
		},
	}
	return plugin
}

export function buildDeployPackageJson(options: DeployPackageJsonOptions): DeployPackageJson {
	const description: string = options.description ?? `${options.packageJson.description ?? options.packageJson.name ?? 'Node service'} deploy artifact`
	const deployPackageJson: DeployPackageJson = {
		name: options.packageJson.name,
		description,
		author: options.packageJson.author,
		version: options.packageJson.version,
		private: true,
		type: options.packageJson.type ?? 'module',
		main: options.main,
		engines: options.packageJson.engines,
		dependencies: options.runtimeDependencies,
	}
	return deployPackageJson
}

export function deployPackageManifestPlugin(options: DeployPackageManifestPluginOptions): Plugin {
	const plugin: Plugin = {
		name: 'deploy-package-manifest',
		setup(build: PluginBuild): void {
			build.onEnd(async (result) => {
				if (result.errors.length > 0) return
				const deployPackageJson: DeployPackageJson = buildDeployPackageJson(options)
				await writeFile(options.outputPath, `${JSON.stringify(deployPackageJson, null, 2)}\n`, 'utf8')
			})
		},
	}
	return plugin
}

function resolveRuntimeDependency(context: RuntimeDependencyBoundaryContext, runtimeDependencyNames: Set<string>, args: OnResolveArgs): OnResolveResult | null {
	if (isNodeBuiltinImport(args.path)) {
		const result: OnResolveResult = { path: args.path, external: true }
		return result
	}

	const packageName: string = barePackageName(args.path)
	if (isInternalWorkspacePackage(packageName, context.workspaceDependencies, context.internalPackageScopes)) return null
	if (runtimeDependencyNames.has(packageName)) {
		const result: OnResolveResult = { path: args.path, external: true }
		return result
	}

	addDiscoveredRuntimeDependency(context, packageName, args.importer)
	runtimeDependencyNames.add(packageName)
	const result: OnResolveResult = { path: args.path, external: true }
	return result
}

function addDiscoveredRuntimeDependency(context: RuntimeDependencyBoundaryContext, dependencyName: string, importer: string): void {
	if (context.runtimeDependencies[dependencyName]) return

	const version: string | null = runtimeDependencyVersionFromImporter(context, dependencyName, importer)
	if (!version) throw new Error(`Undeclared runtime package import "${dependencyName}" from "${importer}". Add it to the importing package dependencies or to ${context.errorPackageJsonPath} dependencies.`)
	assertSupportedRuntimeDependencySpec(dependencyName, version)
	context.runtimeDependencies[dependencyName] = version
}

function runtimeDependencyVersionFromImporter(context: RuntimeDependencyBoundaryContext, dependencyName: string, importer: string): string | null {
	const packageJson: PackageJson | null = packageJsonForImporter(context, importer)
	if (!packageJson) return null
	const version: string | null = dependencyVersionFromPackageJson(packageJson, dependencyName)
	return version
}

function packageJsonForImporter(context: RuntimeDependencyBoundaryContext, importer: string): PackageJson | null {
	if (!importer) return context.fallbackPackageJson

	let currentDirPath: string = dirname(importer)
	while (currentDirPath.startsWith(context.workspaceRootPath)) {
		const packageJsonPath: string = resolve(currentDirPath, 'package.json')
		if (existsSync(packageJsonPath)) {
			const packageJson: PackageJson = cachedPackageJson(context.packageJsonCache, packageJsonPath)
			return packageJson
		}

		const nextDirPath: string = dirname(currentDirPath)
		if (nextDirPath === currentDirPath) break
		currentDirPath = nextDirPath
	}
	return null
}

function cachedPackageJson(packageJsonCache: Map<string, PackageJson>, packageJsonPath: string): PackageJson {
	const cachedPackageJson: PackageJson | undefined = packageJsonCache.get(packageJsonPath)
	if (cachedPackageJson) return cachedPackageJson

	const packageJsonRaw: string = readFileSync(packageJsonPath, 'utf8')
	const packageJson: PackageJson = JSON.parse(packageJsonRaw) as PackageJson
	packageJsonCache.set(packageJsonPath, packageJson)
	return packageJson
}

function dependencyVersionFromPackageJson(packageJson: PackageJson, dependencyName: string): string | null {
	const version: string | null = packageJson.dependencies?.[dependencyName] ?? packageJson.peerDependencies?.[dependencyName] ?? packageJson.optionalDependencies?.[dependencyName] ?? null
	return version
}

function isWorkspaceDependencySpec(version: string): boolean {
	const result: boolean = version.startsWith('workspace:')
	return result
}

function assertSupportedRuntimeDependencySpec(dependencyName: string, version: string): void {
	if (version.startsWith('link:') || version.startsWith('file:')) throw new Error(`Unsupported runtime dependency spec for ${dependencyName}: ${version}`)
}

function isInternalWorkspacePackage(packageName: string, workspaceDependencies: Set<string>, internalPackageScopes: string[]): boolean {
	if (workspaceDependencies.has(packageName)) return true
	const result: boolean = internalPackageScopes.some((scope) => packageName.startsWith(`${scope}/`))
	return result
}

function isNodeBuiltinImport(importPath: string): boolean {
	if (importPath.startsWith('node:')) return true
	const result: boolean = builtinModules.includes(importPath)
	return result
}

function barePackageName(importPath: string): string {
	if (importPath.startsWith('@')) {
		const parts: string[] = importPath.split('/')
		const packageName: string = `${parts[0]}/${parts[1]}`
		return packageName
	}

	const parts: string[] = importPath.split('/')
	const packageName: string = parts[0]
	return packageName
}
