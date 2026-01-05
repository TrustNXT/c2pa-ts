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
