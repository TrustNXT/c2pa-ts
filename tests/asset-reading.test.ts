import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { describe, it } from 'bun:test';
import { Asset, AssetType, BMFF, JPEG, PNG } from '../src/asset';
import { SuperBox } from '../src/jumbf';
import { ManifestStore, ValidationResult, ValidationStatusCode } from '../src/manifest';
import { BinaryHelper } from '../src/util';

const baseDir = 'tests/fixtures';

interface TestExpectations {
    /**
     * Asset class to read the file
     */
    assetType: AssetType;

    /**
     * whether the file contains a JUMBF with a C2PA Manifest
     */
    jumbf: boolean;

    /**
     * whether the file is valid according to the C2PA Manifest
     */
    valid?: boolean;

    /**
     * status codes expected in the status entries
     */
    statusCodes?: ValidationStatusCode[];
}

// test data sets with file names and expected outcomes
const testFiles: Record<string, TestExpectations> = {
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-A.jpg': {
        assetType: JPEG,
        jumbf: false,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-C.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-CA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-CACA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-CACAICAICICA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-CAI.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-CAICA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-CAICAI.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-CAIAIIICAICIICAIICICA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: false,
        statusCodes: [ValidationStatusCode.AssertionActionIngredientMismatch],
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-CI.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-CICA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-CICACACA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-CIE-sig-CA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-CII.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-E-clm-CAICAI.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: false,
        statusCodes: [
            ValidationStatusCode.AssertionHashedURIMismatch,
            ValidationStatusCode.AssertionActionIngredientMismatch,
        ],
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-E-dat-CA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: false,
        statusCodes: [ValidationStatusCode.AssertionDataHashMismatch],
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-E-sig-CA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: false,
        statusCodes: [ValidationStatusCode.ClaimSignatureMismatch, ValidationStatusCode.TimeStampMismatch],
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-E-uri-CA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: false,
        statusCodes: [ValidationStatusCode.AssertionHashedURIMismatch],
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-E-uri-CIE-sig-CA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-I.jpg': {
        assetType: JPEG,
        jumbf: false,
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-XCA.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: false,
        statusCodes: [ValidationStatusCode.AssertionDataHashMismatch],
    },
    'public-testfiles/legacy/1.4/image/jpeg/adobe-20220124-XCI.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: false,
        statusCodes: [ValidationStatusCode.AssertionDataHashMismatch],
    },
    'public-testfiles/legacy/1.4/image/jpeg/nikon-20221019-building.jpeg': {
        assetType: JPEG,
        jumbf: true,
        valid: false,
        statusCodes: [ValidationStatusCode.SigningCredentialExpired],
    },
    'public-testfiles/legacy/1.4/image/jpeg/truepic-20230212-camera.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/truepic-20230212-landscape.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'public-testfiles/legacy/1.4/image/jpeg/truepic-20230212-library.jpg': {
        assetType: JPEG,
        jumbf: true,
        valid: true,
    },
    'amazon-titan-g1.png': {
        assetType: PNG,
        jumbf: true,
        valid: true,
    },
    'trustnxt-icon.jpg': {
        assetType: JPEG,
        jumbf: false,
    },
    'trustnxt-icon.png': {
        assetType: PNG,
        jumbf: false,
    },
    'trustnxt-icon.heic': {
        assetType: BMFF,
        jumbf: false,
    },
    'trustnxt-icon-signed-v2-bmff.heic': {
        assetType: BMFF,
        jumbf: true,
        valid: true,
    },
};

describe('Functional Asset Reading Tests', function () {
    for (const [filename, data] of Object.entries(testFiles)) {
        describe(`test file ${filename}`, () => {
            let buf: Buffer | undefined = undefined;
            it(`loading test file`, async () => {
                // load the file into a buffer
                buf = await fs.readFile(`${baseDir}/${filename}`);
                assert.ok(buf);
            });

            let asset: Asset | undefined = undefined;
            it(`constructing the asset`, async function () {
                if (!buf) return;

                // ensure it's a JPEG
                assert.ok(data.assetType.canRead(buf));

                // construct the asset
                asset = new data.assetType(buf);
            });

            let jumbf: Uint8Array | undefined = undefined;
            it(`extract the manifest JUMBF`, async function () {
                if (!asset) return;

                // extract the C2PA manifest store in binary JUMBF format
                jumbf = asset.getManifestJUMBF();
                if (data.jumbf) {
                    assert.ok(jumbf, 'no JUMBF found');
                } else {
                    assert.ok(jumbf === undefined, 'unexpected JUMBF found');
                }
            });

            if (data.jumbf) {
                let validationResult: ValidationResult | undefined = undefined;
                it(`validate manifest`, async function () {
                    if (!jumbf || !asset) return;

                    // deserialize the JUMBF box structure
                    const superBox = SuperBox.fromBuffer(jumbf);

                    // verify raw content
                    // Note: The raw content does not include the header (length, type),
                    // hence the offset 8.
                    assert.ok(superBox.rawContent);
                    assert.ok(
                        BinaryHelper.bufEqual(superBox.rawContent, jumbf.subarray(8)),
                        'the stored raw content is different from the stored JUMBF data',
                    );

                    // Read the manifest store from the JUMBF container
                    const manifests = ManifestStore.read(superBox);

                    // Validate the asset with the manifest
                    validationResult = await manifests.validate(asset);

                    const message =
                        data.valid ?
                            `Manifest should be valid but is not (status codes: ${validationResult.statusEntries
                                .filter(e => !e.success)
                                .map(e => e.code)
                                .join(', ')})`
                        :   'Manifest is valid but should not be';
                    assert.equal(validationResult.isValid, data.valid, message);
                });

                data.statusCodes?.forEach(value => {
                    it(`check status code ${value}`, async function () {
                        if (validationResult === undefined) return;

                        assert.ok(
                            validationResult.statusEntries.some(entry => entry.code === value),
                            `missing status code ${value}`,
                        );
                    });
                });
            }
        });
    }
});
