---
'@trustnxt/c2pa-ts': minor
---

Add MP4 video file support
- Added support for MP4 video files (mp41, mp42, isom brands)
- Implemented StcoBox and Co64Box classes for proper chunk offset patching when inserting C2PA manifests in MP4 files
- Fixed QuickTime-style MetaBox parsing to handle both ISO BMFF and QuickTime formats
- Fixed JUMBF extraction to exclude trailing padding bytes
- Made metadata assertion JSON-LD parser more lenient with undefined prefixes
- Added MP4 video signing and validation tests
- MP4 files can now be signed and validated using BMFF v2 and v3 hash assertions
