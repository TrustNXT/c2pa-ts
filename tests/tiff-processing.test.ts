import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { Asset, JUMBF, Manifest } from '../src';

// location of the TIFF images
const baseDir = 'tests';

// test data sets with file names and expected outcomes
const testFiles = {
    'c2pa.tiff': {
        jumbf: false,
        valid: undefined,
    },
    'c2pa_signed_ed25519.tiff': {
        jumbf: true,
        valid: true,
    },
};

describe('Functional TIFF Reading Tests', function () {
    this.timeout(0);

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

                // ensure it's a TIFF
                assert.ok(Asset.TIFF.canRead(buf));

                // construct the asset
                asset = new Asset.TIFF(buf);
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
