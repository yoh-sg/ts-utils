# @yohs/esbuild-utils

Reusable esbuild helpers that make it easier to bootstrap local dev flows:

- Opinionated runners that keep long-lived processes in sync with esbuild outputs
- Quality-of-life plugins (clear console, custom logging, persistent spinner)
- Runtime-artifact helpers for bundled Node services that need generated deploy manifests

## Quick start

```bash
pnpm add -D @yohs/esbuild-utils
```

```ts
import { clearConsolePlugin, runFunctionsPlugin } from '@yohs/esbuild-utils'

export default {
  plugins: [
    clearConsolePlugin,
    runFunctionsPlugin({
      target: 'handler',
      signatureType: 'cloudevent',
      port: 5012,
    }),
  ],
}
```

> ℹ️  Console / CLI helpers (`animation`, `args-serialize`, `run-npx`) now live in [`@yohs/node-utils`](https://github.com/YLS-/ts-utils/tree/main/packages/node-utils) and are **no longer** re-exported from this package. Import them directly from `@yohs/node-utils/*` if you still need them alongside these plugins.

> ⚠️ The `runFunctionsPlugin` depends on [`@yohs/gcp-utils`](https://github.com/YLS-/ts-utils/tree/main/packages/gcp-utils) for its Functions Framework runner. Install it alongside this package when you need that plugin.

## Available entry-points

- `@yohs/esbuild-utils` – re-exports everything in this package
- `@yohs/esbuild-utils/plugins` – bundled access to every plugin helper

## Runtime artifact helpers

Bundled Node services often need a deploy artifact whose `package.json` is narrower than the source package manifest. The runtime-artifact helpers support that shape:

- registry dependencies are externalized and copied into the generated deploy manifest;
- `workspace:*` dependencies are treated as source dependencies and bundled;
- registry dependencies discovered from bundled workspace importers are added to the deploy manifest from the importer package's own dependency spec;
- undeclared third-party bare imports fail during esbuild resolution.

```ts
import { createRuntimeDependencyBoundaryContext, deployPackageManifestPlugin, readPackageJson, runtimeDependencyBoundaryPlugin } from '@yohs/esbuild-utils/plugins'

const packageJson = await readPackageJson('package.json')
const boundary = createRuntimeDependencyBoundaryContext({
  workspaceRootPath: process.cwd(),
  packageJson,
  internalPackageScopes: ['@muse'],
  errorPackageJsonPath: 'services/my-service/package.json',
})

export default {
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: '.build/main.js',
  plugins: [
    runtimeDependencyBoundaryPlugin(boundary),
    deployPackageManifestPlugin({
      outputPath: '.build/package.json',
      packageJson,
      runtimeDependencies: boundary.runtimeDependencies,
      main: 'main.js',
    }),
  ],
}
```

## Scripts

- `pnpm build` – emits ESM modules and d.ts files via **tsdown**
- `pnpm test` – runs the vitest suite
- `pnpm lint` / `pnpm typecheck` – local validation helpers
