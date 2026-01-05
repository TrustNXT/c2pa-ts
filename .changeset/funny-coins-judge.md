---
'@trustnxt/c2pa-ts': minor
---

# Large Asset Support - Asset Abstraction

> ⚠️ **Breaking API Changes** — Several methods are now async. Add `await` where needed.

## What's New

- **Blob support**: Assets accept `Uint8Array` or `Blob` — enables streaming large files (multi-GB) without loading into memory
- **`writeToFile(path)`**: Streams output directly to disk (preferred for large files)
- **`getBlob()`**: Returns underlying Blob if available

## Breaking Changes

These methods are now async:

| Method                  | Now returns                        |
| ----------------------- | ---------------------------------- |
| `getDataRange()`        | `Promise<Uint8Array>`              |
| `getManifestJUMBF()`    | `Promise<Uint8Array \| undefined>` |
| `ensureManifestSpace()` | `Promise<void>`                    |
| `writeManifestJUMBF()`  | `Promise<void>`                    |
