# c2pa-ts

## 0.13.1

### Patch Changes

- c3d5993: Use proper DER encoding for CMS SignedAttributes

## 0.13.0

### Minor Changes

- 1e7491c: Runtime Agnostic Streaming - Breaking API Change

    ### Changed APIs
    - `writeToFile(path: string)` → `writeToStream(stream: WritableStream<Uint8Array>)`

    This change affects:
    - `AssetDataReader.writeToFile` → `AssetDataReader.writeToStream`
    - `Asset.writeToFile` → `Asset.writeToStream`
    - `BaseAsset.writeToFile` → `BaseAsset.writeToStream`
    - `BlobDataReader.writeToFile` → `BlobDataReader.writeToStream`
    - `BufferDataReader.writeToFile` → `BufferDataReader.writeToStream`

    ### Migration Guide

    The caller is now responsible for creating the `WritableStream` using their runtime:

    **Node.js:**

    ```typescript
    import { createWriteStream } from 'node:fs';
    import { Writable } from 'node:stream';

    const nodeStream = createWriteStream(outputPath);
    const writableStream = Writable.toWeb(nodeStream);
    await asset.writeToStream(writableStream);
    ```

    ### Removed Node.js Imports
    - Removed `import { createWriteStream, WriteStream } from 'node:fs'` from `BlobDataReader.ts`
    - Removed `import { writeFile } from 'node:fs/promises'` from `BufferDataReader.ts`

    This enables the library to be bundled for client-side applications (e.g., Next.js with Turbopack) without Node.js polyfills.

## 0.12.1

### Patch Changes

- 0831623: ### Browser Compatibility Fix

    Fixed a bundler error that occurred when using c2pa-ts in browser environments (e.g., Next.js with Turbopack).

    **Problem:**
    Top-level imports of Node.js `fs` and `fs/promises` modules in `BlobDataReader` and `BufferDataReader` caused build failures in browser bundlers, even though the `writeToFile()` method is only intended for Node.js usage.

    **Solution:**
    Converted static top-level imports to dynamic imports inside `writeToFile()` methods. This ensures the `fs` modules are only loaded when `writeToFile()` is actually called at runtime, allowing the library to be bundled for browser environments without errors.

    **Note:** The `writeToFile()` method remains Node.js-only and will fail if called in a browser environment.

## 0.12.0

### Minor Changes

- 1deb78f: Add MP4 video file support
    - Added support for MP4 video files (mp41, mp42, isom brands)
    - Implemented StcoBox and Co64Box classes for proper chunk offset patching when inserting C2PA manifests in MP4 files
    - Fixed QuickTime-style MetaBox parsing to handle both ISO BMFF and QuickTime formats
    - Fixed JUMBF extraction to exclude trailing padding bytes
    - Made metadata assertion JSON-LD parser more lenient with undefined prefixes
    - Added MP4 video signing and validation tests
    - MP4 files can now be signed and validated using BMFF v2 and v3 hash assertions

### Patch Changes

- 6f65a61: Increase interoperability when using LocalTimestampProvider

## 0.11.0

### Minor Changes

- b3c0102: # Large Asset Support - Asset Abstraction

    > ⚠️ **Breaking API Changes** — Several methods are now async. Add `await` where needed.

    ## What's New
    - **Blob support**: Assets accept `Uint8Array` or `Blob` — enables streaming large files (multi-GB) without loading into memory
    - **`writeToFile(path)`**: Streams output directly to disk (preferred for large files)
    - **`getBlob()`**: Returns underlying Blob if available

    ## Breaking Changes

    ### Asset Creation & Interface

    The `AssetType` interface has been updated to support async creation and `Blob` sources. Use `create()` instead of `new`.

    ```typescript
    // Before
    const asset = new JPEG(data);
    const canRead = JPEG.canRead(data);

    // After
    const asset = await JPEG.create(data);
    const canRead = await JPEG.canRead(data);
    ```

    ### Async Methods

    These methods are now async:

    | Method                  | Now returns                        |
    | ----------------------- | ---------------------------------- |
    | `canRead()`             | `Promise<boolean>`                 |
    | `create()`              | `Promise<Asset>`                   |
    | `getManifestJUMBF()`    | `Promise<Uint8Array \| undefined>` |
    | `ensureManifestSpace()` | `Promise<void>`                    |
    | `writeManifestJUMBF()`  | `Promise<void>`                    |

## 0.10.0

### Minor Changes

- 1e8b6e0: Write ECDSA signatures in P1363 format

## 0.9.5

### Patch Changes

- 68b9c64: Fix TypeScript 5.8+ ArrayBuffer/BufferSource compatibility inconsistencies

## 0.9.4

### Patch Changes

- 25ec311: github release

## 0.9.3

### Patch Changes

- 239954e: github release

## 0.9.2

### Patch Changes

- d048ed3: github release

## 0.9.1

### Patch Changes

- 29e043d: switch NPM publish to use OIDC

## 0.9.0

### Minor Changes

- 7e4c824: Add MP3 support

## 0.8.0

### Minor Changes

- f8a48f3: Breaking Change: Introduce Signer interface to support external signing of manifests

## 0.7.1

### Patch Changes

- e8a9d1a: Add missing v2 prop `c2pa_manifest` in `IngredientAssertion` for backward compatibility.
- e8a9d1a: Switch to tsup for building the dist

## 0.7.0

### Minor Changes

- 48a0242: Fix field mappings for actions assertion
- e07fab7: Implement v2 timestamping (sigTst2)
- 85916f6: BMFF hash v3 assertion

### Patch Changes

- 774c5ef: Enhanced timestamp validation

## 0.6.0

### Minor Changes

- 097fab2: C2PA v2.1 Updates - ingredients assertion v3

## 0.5.4

### Patch Changes

- b90dd4b: Use two underscores for ingredient thumbnail assertion suffix

## 0.5.3

### Patch Changes

- cf0a06a: Training and Data Mining assertion: Do not write empty constraint_info fields

## 0.5.2

### Patch Changes

- 4a45454: Update Training and Data Mining assertion according to CAWG spec update

## 0.5.1

### Patch Changes

- df61eb6: Populate success field of ValidationResult entries
- 5c6e74e: Handle edge cases during string measuring

## 0.5.0

### Minor Changes

- 0fb414c: Support additional assertions (Training and Data Mining, CAWG Metadata)
- 33e0541: Fix COSE deserilization failing for single-certificate chains

## 0.4.1

### Patch Changes

- 4a9fc91: Fix build errors

## 0.4.0

### Minor Changes

- 67def7a: Use TypedArray support in typed-binary for better performance

## 0.3.2

### Patch Changes

- dfe157b: Don't check signature algorithm allow list for chain certificates

## 0.3.1

### Patch Changes

- 3464be0: BMFF: Fix adjustment of extents in iloc box

## 0.3.0

### Minor Changes

- 3b5dbfd: Add RFC3161 timestamping support

## 0.2.2

No changes, build script fixes only

## 0.2.1

No changes, build script fixes only

## 0.2.0

### Minor Changes

- 25908af: Implement thumbnail assertion

## 0.1.2

### Patch Changes

- 64716ad: initial release

## 0.1.1

### Patch Changes

- 1e92d8c: initial release
