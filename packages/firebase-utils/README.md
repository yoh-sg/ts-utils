# @yohs/firebase-utils

Utility helpers shared across Firebase Admin and Google Cloud Platform runtimes.

## Highlights

- Firestore batch + path helpers that stay under API limits
- Token verification cache for Firebase Auth Admin SDK
- Google Cloud Storage helpers for deterministic buckets and signed URLs

Install the package via npm/pnpm once it has been published:

```bash
pnpm add @yohs/firebase-utils
```

Bring your own SDKs – the package only declares optional peer dependencies on
`firebase-admin` and `@google-cloud/storage` so you can decide which parts of the
stack to ship with your application.

## Conditional Storage Uploads

`uploadFile` accepts the Cloud Storage generation preconditions used for compare-and-swap writes and returns the exact generation accepted by GCS:

```ts
import { uploadFile, type UploadedGcsObjectRef } from '@yohs/firebase-utils/storage'

const uploaded: UploadedGcsObjectRef = await uploadFile(bucket, 'analytics/ig', 'current', 'json', canonicalJson, {
	compression: 'gzip',
	metadata: { contentType: 'application/json', cacheControl: 'no-store' },
	preconditionOpts: { ifGenerationMatch: previousGeneration ?? 0 }
})

console.log(uploaded.generation)
```

Use `ifGenerationMatch: 0` to create only when the object is absent, or pass the generation returned by the preceding accepted upload to replace that exact version.
