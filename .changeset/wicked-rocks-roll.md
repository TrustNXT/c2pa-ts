---
'@trustnxt/c2pa-ts': minor
---

Runtime Agnostic Streaming - Breaking API Change

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
