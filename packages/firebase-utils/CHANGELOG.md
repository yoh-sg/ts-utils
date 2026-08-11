# @yohs/firebase-utils

## 0.3.9

### Patch Changes

- [`68779a9`](https://github.com/yoh-sg/ts-utils/commit/68779a994dd177896fed5bf8c62d1a8383d7f606) Thanks [@yoh-sg](https://github.com/yoh-sg)! - Allow callers to tune Brotli compression parameters through storage uploads while preserving the existing defaults.

- Updated dependencies [[`68779a9`](https://github.com/yoh-sg/ts-utils/commit/68779a994dd177896fed5bf8c62d1a8383d7f606)]:
  - @yohs/node-utils@0.2.5

## 0.3.8

### Patch Changes

- Support generation-preconditioned GCS uploads and return the accepted object generation.

## 0.3.7

### Patch Changes

- Add gzip support for Firebase Storage uploads.

- Updated dependencies []:
  - @yohs/node-utils@0.2.4

## 0.3.6

### Patch Changes

- Import toNDJSON from Node utils

## 0.3.5

### Patch Changes

- Allow custom metadata on Storage uploads

## 0.3.4

### Patch Changes

- Fixed Node-only deps (sha256, brotli)

## 0.3.3

### Patch Changes

- Add `bucket` field on `GcsObjectRef`

## 0.3.2

### Patch Changes

- Export GCS internal types

## 0.3.1

### Patch Changes

- Fix undefined in file upload ref object

## 0.3.0

### Minor Changes

- Add Storage upload helpers

## 0.2.0

### Minor Changes

- Add firebase-scripts helper

## 0.1.3

### Patch Changes

- Fix collection iterate last doc index

## 0.1.2

### Patch Changes

- Fix export gcs-object

## 0.1.1

### Patch Changes

- Add gcs-object (GcsObjectRef type pointing at Storage file)

## 0.1.0

### Minor Changes

- Add timestamp, default-converter, collection-iterate
