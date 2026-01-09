---
'@trustnxt/c2pa-ts': patch
---

### Browser Compatibility Fix

Fixed a bundler error that occurred when using c2pa-ts in browser environments (e.g., Next.js with Turbopack).

**Problem:**
Top-level imports of Node.js `fs` and `fs/promises` modules in `BlobDataReader` and `BufferDataReader` caused build failures in browser bundlers, even though the `writeToFile()` method is only intended for Node.js usage.

**Solution:**
Converted static top-level imports to dynamic imports inside `writeToFile()` methods. This ensures the `fs` modules are only loaded when `writeToFile()` is actually called at runtime, allowing the library to be bundled for browser environments without errors.

**Note:** The `writeToFile()` method remains Node.js-only and will fail if called in a browser environment.
