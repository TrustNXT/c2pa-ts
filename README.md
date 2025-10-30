<a id="readme-top"></a>

# c2pa-ts

## About

`c2pa-ts` is a pure TypeScript implementation of [Coalition for Content Provenance and Authenticity (C2PA)](https://c2pa.org/) according to [specification version 2.1](https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html).

It does not use any native binaries or WebAssembly and is therefore truly platform independent. In modern browsers as well as Node.js it should run out of the box. In mobile apps or other environments lacking browser APIs, some external code may be necessary (see [below](#usage-in-constrained-environments) for details).

Developed and curated by [TrustNXT](https://trustnxt.com) in Hamburg, Germany and licensed under the Apache 2.0 License. [Contributions welcome!](#contributing)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap and current status

This library is under active development and not fully functional yet. Proceed with caution!

Anything that's not listed below is not currently planned to be implemented.

### Overall functionality

- :white_check_mark: Reading manifests
- :construction: Validating manifests (mostly implemented except chain of trust validation)
- :white_check_mark: Creating manifests

:information_source: On C2PA versions: The library is targeted at C2PA specification 2.1, however data structures from older versions of the specification are also supported for backwards compatibility.

:information_source: Although it is a separate project from C2PA, the library also includes support for several [CAWG](https://github.com/creator-assertions/) assertions.

### Asset file formats

- :white_check_mark: JPEG
- :white_check_mark: PNG
- :white_check_mark: HEIC/HEIF
- :white_check_mark: MP3
- :x: GIF
- :x: TIFF
- :x: WebP
- :x: JPEG XL

### Supported assertions

- :white_check_mark: Data Hash
- :white_check_mark: BMFF-Based Hash (v2 and v3)
- :x: General Boxes Hash
- :white_check_mark: Thumbnail
- :white_check_mark: Actions (except action templates and metadata)
- :white_check_mark: Ingredient (v2 and v3)
- :white_check_mark: Metadata (specialized, common, generic, and CAWG variants)
- :white_check_mark: Creative Work
- :white_check_mark: Training and Data Mining (C2PA and CAWG variants)
- :x: CAWG Identity

### JUMBF boxes

- :white_check_mark: CBOR boxes
- :white_check_mark: JSON boxes
- :white_check_mark: Codestream boxes
- :white_check_mark: Embedded file boxes
- :white_check_mark: UUID boxes
- :white_check_mark: C2PA salt boxes
- :x: Compressed boxes

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage examples

<details>

<summary>Reading and validating a manifest</summary>

Example usage in a Node.js environment:

```typescript
import * as fs from 'node:fs/promises';
import { MalformedContentError } from '@trustnxt/c2pa-ts';
import { Asset, BMFF, JPEG, PNG } from '@trustnxt/c2pa-ts/asset';
import { SuperBox } from '@trustnxt/c2pa-ts/jumbf';
import { ManifestStore, ValidationResult, ValidationStatusCode } from '@trustnxt/c2pa-ts/manifest';

if (process.argv.length < 3) {
    console.error('Missing filename');
    process.exit(1);
}

const buf = await fs.readFile(process.argv[2]);

// Read the asset file and dump some information about its structure
let asset: Asset;
if (JPEG.canRead(buf)) {
    asset = new JPEG(buf);
} else if (PNG.canRead(buf)) {
    asset = new PNG(buf);
} else if (BMFF.canRead(buf)) {
    asset = new BMFF(buf);
} else {
    console.error('Unknown file format');
    process.exit(1);
}
console.log(asset.dumpInfo());

// Extract the C2PA manifest store in binary JUMBF format
const jumbf = asset.getManifestJUMBF();

if (jumbf) {
    let validationResult: ValidationResult;

    try {
        // Deserialize the JUMBF box structure
        const superBox = SuperBox.fromBuffer(jumbf);
        console.log('JUMBF structure:');
        console.log(superBox.toString());

        // Read the manifest store from the JUMBF container
        const manifests = ManifestStore.read(superBox);

        // Validate the active manifest
        validationResult = await manifests.validate(asset);
    } catch (e) {
        // Gracefully handle any exceptions to make sure we get a well-formed validation result
        validationResult = ValidationResult.fromError(e as Error);
    }

    console.log('Validation result', validationResult);
}
```

</details>

<details>

<summary>Creating a manifest</summary>

This still needs proper example code ([issue #58](https://github.com/TrustNXT/c2pa-ts/issues/58)). For now, you can check [`jpeg-signing.test.ts`](https://github.com/TrustNXT/c2pa-ts/blob/b6cfeaa17d24c82c5c0ecc163a43a646806b189e/tests/jpeg-signing.test.ts#L53-L83).

</details>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage in constrained environments

Usage with JavaScript engines that lack WebCrypto and other browser APIs (such as JavaScriptCore on iOS) is entirely possible but will require some additional code. In particular, a custom `CryptoProvider` will need to be created and some polyfills might be required.

For more information or a reference iOS implementation, <a href="mailto:mail@trustnxt.com">contact us</a>.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

Contributions are welcome!

- [Create an issue](https://github.com/TrustNXT/c2pa-ts/issues)
- [Fork this repository](https://github.com/TrustNXT/c2pa-ts/fork)
- [Open a pull request](https://github.com/TrustNXT/c2pa-ts/pulls)

When you're done with your changes, we use [changesets](https://github.com/changesets/changesets) to manage release notes. Run `npm run changeset` to autogenerate notes to be appended to your pull request.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

Distributed under the Apache 2.0 License. See `LICENSE.md` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

Created and curated by TrustNXT GmbH, a proud member of CAI and C2PA.

- [Website](https://trustnxt.com/)
- [LinkedIn](https://www.linkedin.com/company/trustnxt/)

This project is not affiliated with or endorsed by CAI, C2PA, CAWG, or any other organization except TrustNXT.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Acknowledgments

The following resources were helpful during creation of this library:

- [c2pa-rs](https://github.com/contentauth/c2pa-rs/)
- [public-testfiles](https://github.com/c2pa-org/public-testfiles/)
- [CAI Discord server](https://discord.gg/CAI)
- [@peculiar/x509](https://github.com/PeculiarVentures/x509)
- [PKI.js](https://github.com/PeculiarVentures/PKI.js)
- [ASN1.js](https://github.com/PeculiarVentures/ASN1.js)
- [MIPAMS JPEG Systems](https://github.com/nickft/mipams-jpeg-systems)
- [cbor-x](https://github.com/kriszyp/cbor-x)
- [mocha](https://mochajs.org)
- [typed-binary](https://github.com/iwoplaza/typed-binary)

Thank you for providing them and keeping open source alive!

<p align="right">(<a href="#readme-top">back to top</a>)</p>
