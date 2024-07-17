<a id="readme-top"></a>

# c2pa-ts

## About

`c2pa-ts` is a pure TypeScript implementation of [Coalition for Content Provenance and Authenticity (C2PA)](https://c2pa.org/) according to [specification version 2.0](https://c2pa.org/specifications/specifications/2.0/specs/C2PA_Specification.html).

It does not use any native binaries or WebAssembly and is therefore truly platform independent. In modern browsers as well as Node.js it should run out of the box. In mobile apps or other environments lacking browser APIs, some external code may be necessary (see [below](#usage-in-constrained-environments) for details).

Developed and curated by [TrustNXT](https://trustnxt.com) in Hamburg, Germany and licensed under the Apache 2.0 License. [Contributions welcome!](#contributing)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap and current status

This library is under active development and not fully functional yet. Proceed with caution!

Anything that's not listed below is not currently planned to be implemented.

### Overall functionality

- :white_check_mark: Reading manifests
- :construction: Validating manifests (mostly implemented except chain of trust validation)
- :x: Creating manifests

### Asset file formats

- :white_check_mark: JPEG
- :white_check_mark: PNG
- :white_check_mark: HEIC/HEIF
- :x: GIF
- :construction: TIFF (Basic support exists, but it is mostly unproven)
- :x: WebP

### Supported assertions

- :white_check_mark: Data Hash
- :white_check_mark: BMFF-Based Hash (except Merkle tree hashing)
- :x: General Boxes Hash
- :x: Thumbnail
- :white_check_mark: Actions
- :white_check_mark: Ingredient
- :x: Metadata
- :x: [CAWG](https://github.com/creator-assertions/) assertions

### JUMBF boxes

- :white_check_mark: CBOR boxes
- :white_check_mark: JSON boxes
- :white_check_mark: Codestream boxes
- :white_check_mark: Embedded file boxes
- :white_check_mark: UUID boxes
- :white_check_mark: C2PA salt boxes
- :x: Compressed boxes

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage example

Example usage in a Node.js environment:

```typescript
import * as fs from 'node:fs/promises';
import { Asset, JUMBF, Manifest, MalformedContentError } from 'c2pa-ts';

if (process.argv.length < 3) {
    console.error('Missing filename');
    process.exit(1);
}

const buf = await fs.readFile(process.argv[2]);

// Read the asset file and dump some information about its structure
let asset: Asset.Asset;
if (Asset.JPEG.canRead(buf)) {
    asset = new Asset.JPEG(buf);
} else if (Asset.PNG.canRead(buf)) {
    asset = new Asset.PNG(buf);
} else if (Asset.BMFF.canRead(buf)) {
    asset = new Asset.BMFF(buf);
} else {
    console.error('Unknown file format');
    process.exit(1);
}
console.log(asset.dumpInfo());

// Extract the C2PA manifest store in binary JUMBF format
const jumbf = asset.getManifestJUMBF();

if (jumbf) {
    let validationResult: Manifest.ValidationResult;

    try {
        // Deserialize the JUMBF box structure
        const superBox = JUMBF.SuperBox.fromBuffer(jumbf);
        console.log('JUMBF structure:');
        console.log(superBox.toString());

        // Read the manifest store from the JUMBF container
        const manifests = Manifest.ManifestStore.read(superBox);

        // Validate the active manifest
        validationResult = await manifests.validate(asset);

    } catch (e) {
        // Gracefully handle any exceptions to make sure we get a well-formed validation result
        if (e instanceof MalformedContentError) {
            validationResult = Manifest.ValidationResult.error(Manifest.ValidationStatusCode.GeneralError, e.message);
        } else {
            validationResult = Manifest.ValidationResult.fromError(e as Error);
        }
    }

    console.log('Validation result', validationResult);
}
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage in constrained environments

Usage with JavaScript engines that lack WebCrypto and other browser APIs (such as JavaScriptCore on iOS) is entirely possible but will require some additional code. In particular, a custom `CryptoProvider` will need to be created and some polyfills might be required.

For more information or a reference iOS implementation, <a href="mailto:mail@trustnxt.com">contact us</a>.

## Contributing

Contributions are welcome!

- [Create an issue](https://github.com/TrustNXT/c2pa-ts/issues)
- [Fork this repository](https://github.com/TrustNXT/c2pa-ts/fork)
- [Open a pull request](https://github.com/TrustNXT/c2pa-ts/pulls)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

Distributed under the Apache 2.0 License. See `LICENSE.md` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

Created and curated by TrustNXT GmbH, a proud member of CAI and C2PA.

- [Website](https://trustnxt.com/)
- [LinkedIn](https://www.linkedin.com/company/trustnxt/)

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

Thank you for providing them and keeping open source alive!

<p align="right">(<a href="#readme-top">back to top</a>)</p>
