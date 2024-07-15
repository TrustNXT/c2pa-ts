import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { Asset, JUMBF, Manifest } from '../src';

// location of the JPEG images within the checked out test files repo
const baseDir = 'public-testfiles/image/jpeg';

// test data sets with file names and expected outcomes
const testFiles = {
    'adobe-20220124-A.jpg': {
        jumbf: false,
        valid: undefined,
    },
    'adobe-20220124-C.jpg': {
        jumbf: true,
        valid: true,
    },
    'adobe-20220124-CA.jpg': {
        jumbf: true,
        valid: true,
    },
    'adobe-20220124-CACA.jpg': {
        jumbf: true,
        valid: true,
    },
    'adobe-20220124-CACAICAICICA.jpg': {
        jumbf: true,
        valid: true,
    },
    'adobe-20220124-CAI.jpg': {
        jumbf: true,
        valid: true,
    },
    'adobe-20220124-CAICA.jpg': {
        jumbf: true,
        valid: true,
    },
    'adobe-20220124-CAICAI.jpg': {
        jumbf: true,
        valid: true,
    },
    'adobe-20220124-CAIAIIICAICIICAIICICA.jpg': {
        jumbf: true,
        valid: false,
    },
    'adobe-20220124-CI.jpg': {
        jumbf: true,
        valid: true,
    },
    'adobe-20220124-CICA.jpg': {
        jumbf: true,
        valid: true,
    },
    'adobe-20220124-CICACACA.jpg': {
        jumbf: true,
        valid: false,
    },
    'adobe-20220124-CIE-sig-CA.jpg': {
        jumbf: true,
        valid: true,
    },
    'adobe-20220124-CII.jpg': {
        jumbf: true,
        valid: true,
    },

    'adobe-20220124-E-clm-CAICAI.jpg': {
        jumbf: true,
        valid: false,
    },
    'adobe-20220124-E-dat-CA.jpg': {
        jumbf: true,
        valid: false,
    },
    'adobe-20220124-E-sig-CA.jpg': {
        jumbf: true,
        valid: false,
    },
    'adobe-20220124-E-uri-CA.jpg': {
        jumbf: true,
        valid: false,
    },
    'adobe-20220124-E-uri-CIE-sig-CA.jpg': {
        jumbf: true,
        valid: true,
    },
    'adobe-20220124-I.jpg': {
        jumbf: false,
        valid: undefined,
    },
    'adobe-20220124-XCA.jpg': {
        jumbf: true,
        valid: false,
    },
    'adobe-20220124-XCI.jpg': {
        jumbf: true,
        valid: false,
    },
    'adobe-20221004-ukraine_building.jpeg': {
        jumbf: true,
        valid: true,
    },
    'nikon-20221019-building.jpeg': {
        jumbf: true,
        valid: false,
    },
    'truepic-20230212-camera.jpg': {
        jumbf: true,
        valid: true,
    },
    'truepic-20230212-landscape.jpg': {
        jumbf: true,
        valid: true,
    },
    'truepic-20230212-library.jpg': {
        jumbf: true,
        valid: true,
    },
};

describe('Functional JPEG Reading Tests', function () {
    for (const [filename, data] of Object.entries(testFiles)) {
        describe(`test file ${filename}`, () => {
            let buf: Buffer | undefined = undefined;
            it(`loading test file`, async () => {
                // load the file into a buffer
                buf = await fs.readFile(`${baseDir}/${filename}`);
                assert.ok(buf);
            });

            let asset: Asset.Asset | undefined = undefined;
            it(`constructing the asset`, async function () {
                if (!buf) {
                    this.skip();
                }

                // ensure it's a JPEG
                assert.ok(Asset.JPEG.canRead(buf));

                // construct the asset
                asset = new Asset.JPEG(buf);
            });

            let jumbf: Uint8Array | undefined = undefined;
            it(`extract the manifest JUMBF`, async function () {
                if (!asset) {
                    this.skip();
                }

                // extract the C2PA manifest store in binary JUMBF format
                jumbf = asset.getManifestJUMBF();
                if (data.jumbf) {
                    assert.ok(jumbf, 'no JUMBF found');
                } else {
                    assert.ok(jumbf === undefined, 'unexpected JUMBF found');
                }
            });

            if (data.jumbf) {
                it(`validate manifest`, async function () {
                    if (!jumbf || !asset) {
                        this.skip();
                    }

                    // deserialize the JUMBF box structure
                    const superBox = JUMBF.SuperBox.fromBuffer(jumbf);

                    // Read the manifest store from the JUMBF container
                    const manifests = Manifest.ManifestStore.read(superBox);

                    // Validate the asset with the manifest
                    const validationResult = await manifests.validate(asset);
                    assert.equal(validationResult.isValid, data.valid);
                });
            }
        });
    }
});
