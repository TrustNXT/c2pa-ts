# c2pa-ts

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
