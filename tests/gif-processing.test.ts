import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { Asset, JUMBF, Manifest } from '../src';

// location of the GIF images
const baseDir = 'tests';

// test data sets with file names and expected outcomes
const testFiles = {
    'c2pa.gif': {
        jumbf: false,
        valid: undefined,
    },
};

describe('Functional GIF Reading Tests', function () {
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

                // ensure it's a GIF
                assert.ok(Asset.GIF.canRead(buf));

                // construct the asset
                asset = new Asset.GIF(buf);
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
