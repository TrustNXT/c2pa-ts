/* eslint-disable @typescript-eslint/dot-notation */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, it } from 'bun:test';
import { BMFF, BMFFBox } from '../../../src/asset';
import { Crypto } from '../../../src/crypto';
import { HashAlgorithm } from '../../../src/crypto/types';
import { CBORBox, DescriptionBox, SuperBox } from '../../../src/jumbf';
import { BMFFHashAssertion, Claim, ValidationStatusCode } from '../../../src/manifest';
import { AssertionLabels } from '../../../src/manifest/assertions/AssertionLabels';
import * as raw from '../../../src/manifest/rawTypes';

const baseDir = 'tests/fixtures';

function createBMFFMock(): Uint8Array {
    /* prettier-ignore */
    const data = new Uint8Array([
        // ftyp box (24 bytes total)
        0x00, 0x00, 0x00, 0x18, // Box size (24 bytes)
        0x66, 0x74, 0x79, 0x70, // Box type 'ftyp'
        0x68, 0x65, 0x69, 0x63, // Major brand 'heic'
        0x00, 0x00, 0x00, 0x01, // Minor version
        0x68, 0x65, 0x69, 0x63, // Compatible brands 'heic'
        0x6d, 0x69, 0x66, 0x31, // Compatible brands 'mif1'

        // mdat box (16 bytes total)
        0x00, 0x00, 0x00, 0x10, // Box size (16 bytes)
        0x6d, 0x64, 0x61, 0x74, // Box type 'mdat'
        0x00, 0x01, 0x02, 0x03, // Data block 1 (4 bytes)
        0x04, 0x05, 0x06, 0x07, // Data block 2 (4 bytes)
    ]);

    return data;
}

describe('BMFFHashAssertion Mock Tests', function () {
    let assertion: BMFFHashAssertion;
    let superBox: SuperBox;

    beforeEach(() => {
        assertion = new BMFFHashAssertion(3);
        superBox = new SuperBox();
        superBox.descriptionBox = new DescriptionBox();
        superBox.descriptionBox.label = AssertionLabels.bmffV3Hash;
        superBox.descriptionBox.uuid = raw.UUIDs.cborAssertion;
    });

    it('should construct an assertion from a JUMBF box', () => {
        const cborBox = new CBORBox();
        cborBox.content = {
            exclusions: [
                {
                    xpath: '/uuid',
                },
                {
                    xpath: '/ftyp',
                },
            ],
            alg: 'sha256',
            hash: new Uint8Array([1, 2, 3, 4]),
            name: 'Test BMFF Hash',
        };
        superBox.contentBoxes.push(cborBox);

        assertion.readFromJUMBF(superBox, new Claim());

        assert.equal(assertion.sourceBox, superBox);
        assert.equal(assertion.label, AssertionLabels.bmffV3Hash);
        assert.deepEqual(assertion.uuid, raw.UUIDs.cborAssertion);
        assert.equal(assertion.algorithm, 'SHA-256');
        assert.deepEqual(assertion.hash, new Uint8Array([1, 2, 3, 4]));
        assert.equal(assertion.name, 'Test BMFF Hash');
        assert.equal(assertion.exclusions.length, 2);
        assert.equal(assertion.exclusions[0].xpath, '/uuid');
        assert.equal(assertion.exclusions[1].xpath, '/ftyp');
    });

    it('should generate a JUMBF box from the assertion', () => {
        assertion.algorithm = 'SHA-256' as HashAlgorithm;
        assertion.hash = new Uint8Array([1, 2, 3, 4]);
        assertion.name = 'Test BMFF Hash';
        assertion.exclusions = [
            {
                xpath: '/uuid',
                data: [
                    {
                        offset: 8,
                        value: new Uint8Array(BMFF.c2paBoxUserType),
                    },
                ],
            },
            { xpath: '/ftyp' },
            { xpath: '/mfra' },
        ];

        const box = assertion.generateJUMBFBox(new Claim());
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, AssertionLabels.bmffV3Hash);
    });

    it('should validate matching hash against asset', async () => {
        const mockAsset = new BMFF(createBMFFMock());
        assertion.algorithm = 'SHA-256' as HashAlgorithm;
        assertion.hash = new Uint8Array([1, 2, 3, 4]);
        assertion.exclusions = [{ xpath: '/uuid' }];

        // Mock the hashBMFFWithExclusions method to return a matching hash
        const originalMethod = assertion['hashBMFFWithExclusions'].bind(assertion);
        assertion['hashBMFFWithExclusions'] = async () => new Uint8Array([1, 2, 3, 4]);

        const result = await assertion.validateAgainstAsset(mockAsset);

        assert.equal(result.isValid, true);
        assert.equal(result.statusEntries[0].code, ValidationStatusCode.AssertionBMFFHashMatch);

        // Restore original method
        assertion['hashBMFFWithExclusions'] = originalMethod;
    });

    it('should fail validation with mismatched hash', async () => {
        const mockAsset = new BMFF(createBMFFMock());
        assertion.algorithm = 'SHA-256' as HashAlgorithm;
        assertion.hash = new Uint8Array([1, 2, 3, 4]);
        assertion.exclusions = [{ xpath: '/uuid' }];

        // Mock the hashBMFFWithExclusions method to return a different hash
        const originalMethod = assertion['hashBMFFWithExclusions'].bind(assertion);
        assertion['hashBMFFWithExclusions'] = async () => new Uint8Array([5, 6, 7, 8]);

        const result = await assertion.validateAgainstAsset(mockAsset);

        assert.equal(result.isValid, false);
        assert.equal(result.statusEntries[0].code, ValidationStatusCode.AssertionBMFFHashMismatch);

        // Restore original method
        assertion['hashBMFFWithExclusions'] = originalMethod;
    });

    it('should handle exclusions with subset ranges', async () => {
        const mockAsset = new BMFF(createBMFFMock());
        assertion.algorithm = 'SHA-256' as HashAlgorithm;
        assertion.exclusions = [
            {
                xpath: '/mdat',
                subset: [
                    { offset: 0, length: 10 },
                    { offset: 20, length: 15 },
                ],
            },
        ];

        // Mock getMatchingBoxForExclusion to return a box
        const mockBox = {
            offset: 50,
            size: 40,
            type: 'mdat',
            payload: {},
        } as BMFFBox<object>;

        const originalMethod = assertion['getMatchingBoxForExclusion'].bind(assertion);
        assertion['getMatchingBoxForExclusion'] = async () => mockBox;

        await assertion['hashBMFFWithExclusions'](mockAsset);

        // Restore original method
        assertion['getMatchingBoxForExclusion'] = originalMethod;
    });

    it('should throw an error for unsupported hash version', () => {
        assert.throws(() => new BMFFHashAssertion(5), /Unsupported BMFF hash version/);
    });

    it('should fail validation if algorithm is missing', async () => {
        const mockAsset = new BMFF(createBMFFMock());
        assertion.hash = new Uint8Array([1, 2, 3, 4]);

        const result = await assertion.validateAgainstAsset(mockAsset);
        assert.equal(result.isValid, false);
        assert.equal(result.statusEntries[0].code, ValidationStatusCode.AssertionCBORInvalid);
    });

    it('should fail validation for non-BMFF asset', async () => {
        const mockAsset = { getTopLevelBoxes: () => [] } as unknown as BMFF;
        assertion.algorithm = 'SHA-256' as HashAlgorithm;
        assertion.hash = new Uint8Array([1, 2, 3, 4]);

        const result = await assertion.validateAgainstAsset(mockAsset);
        assert.equal(result.isValid, false);
        assert.equal(result.statusEntries[0].code, ValidationStatusCode.AssertionBMFFHashMismatch);
    });

    it('should fail validation when hash does not match', async () => {
        const mockAsset = new BMFF(createBMFFMock());
        assertion.algorithm = 'SHA-256' as HashAlgorithm;
        assertion.hash = new Uint8Array([0, 0, 0, 0]);

        const result = await assertion.validateAgainstAsset(mockAsset);
        assert.equal(result.isValid, false);
        assert.equal(result.statusEntries[0].code, ValidationStatusCode.AssertionBMFFHashMismatch);
    });

    it('should correctly handle v3 merkle tree validation', async () => {
        const mockAsset = new BMFF(createBMFFMock());
        const v3Assertion = new BMFFHashAssertion(3);
        v3Assertion.algorithm = 'SHA-256' as HashAlgorithm;

        // Get the mdat box to find its correct offset
        const mdatBox = mockAsset.getBoxByPath('/mdat');
        assert.ok(mdatBox, 'mdat box not found');

        // Data starts after the box header (8 bytes)
        const dataOffset = mdatBox.offset + 8;

        v3Assertion.merkle = [
            {
                uniqueId: 1,
                localId: 1,
                count: 2,
                hashes: [
                    await Crypto.digest(await mockAsset.getDataRange(dataOffset, 4), 'SHA-256' as HashAlgorithm),
                    await Crypto.digest(await mockAsset.getDataRange(dataOffset + 4, 4), 'SHA-256' as HashAlgorithm),
                ] as Uint8Array[],
                fixedBlockSize: 4,
            },
        ];

        const result = await v3Assertion['validateMerkleTree'](mockAsset);
        assert.ok(result.isValid);
    });

    it('should handle variable block sizes in merkle tree', async () => {
        const mockAsset = new BMFF(createBMFFMock());
        assertion.algorithm = 'SHA-256' as HashAlgorithm;

        // Get the mdat box to find its correct offset
        const mdatBox = mockAsset.getBoxByPath('/mdat');
        assert.ok(mdatBox, 'mdat box not found');

        // Data starts after the box header (8 bytes)
        const dataOffset = mdatBox.offset + 8;

        assertion.merkle = [
            {
                uniqueId: 1,
                localId: 1,
                count: 2,
                variableBlockSizes: [4, 4],
                hashes: [
                    await Crypto.digest(await mockAsset.getDataRange(dataOffset, 4), 'SHA-256' as HashAlgorithm),
                    await Crypto.digest(await mockAsset.getDataRange(dataOffset + 4, 4), 'SHA-256' as HashAlgorithm),
                ] as Uint8Array[],
            },
        ];

        const result = await assertion['validateMerkleTree'](mockAsset);
        assert.ok(result.isValid);
    });
});

describe('BMFFHashAssertion v2 Tests', function () {
    it('should correctly hash HEIC file with v2 assertion', async () => {
        const filePath = path.join(baseDir, 'trustnxt-icon.heic');
        const heicData = new Uint8Array(await fs.readFile(filePath));
        const asset = new BMFF(heicData);
        const v2Assertion = new BMFFHashAssertion(2);
        v2Assertion.algorithm = 'SHA-256' as HashAlgorithm;
        v2Assertion.exclusions = [{ xpath: '/uuid' }];

        const hash = await v2Assertion['hashBMFFWithExclusions'](asset);
        assert.ok(hash instanceof Uint8Array);
        assert.ok(hash.length > 0);
    });
});

describe('BMFFHashAssertion v3 Tests', function () {
    let assertion: BMFFHashAssertion;
    let superBox: SuperBox;

    const findHashAssertion = (box: SuperBox): SuperBox | undefined => {
        if (
            box.descriptionBox?.label === AssertionLabels.bmffV3Hash ||
            box.descriptionBox?.label === AssertionLabels.bmffV2Hash
        ) {
            return box;
        }
        for (const content of box.contentBoxes) {
            if (content instanceof SuperBox) {
                const found = findHashAssertion(content);
                if (found) return found;
            }
        }
        return undefined;
    };

    beforeEach(() => {
        assertion = new BMFFHashAssertion(3);
        superBox = new SuperBox();
        superBox.descriptionBox = new DescriptionBox();
        superBox.descriptionBox.label = AssertionLabels.bmffV3Hash;
        superBox.descriptionBox.uuid = raw.UUIDs.cborAssertion;
    });

    it('should validate v3 hash assertion from signed HEIC', async () => {
        const filePath = path.join(baseDir, 'trustnxt-icon-signed-v2-bmff.heic');
        const signedHeicData = new Uint8Array(await fs.readFile(filePath));
        const signedHeicAsset = new BMFF(signedHeicData);

        const jumbf = signedHeicAsset.getManifestJUMBF();
        assert.ok(jumbf, 'No JUMBF found in signed HEIC');

        const manifestBox = SuperBox.fromBuffer(jumbf);

        const hashAssertion = findHashAssertion(manifestBox);
        assert.ok(hashAssertion, 'No hash assertion found in manifest');
        assertion.readFromJUMBF(hashAssertion, new Claim());

        const result = await assertion.validateAgainstAsset(signedHeicAsset);
        assert.ok(result.isValid);
    });

    it('should construct an assertion from a JUMBF box', () => {
        const cborBox = new CBORBox();
        cborBox.content = {
            exclusions: [{ xpath: '/uuid' }],
            alg: 'sha256',
            hash: new Uint8Array([1, 2, 3, 4]),
            name: 'Test BMFF Hash',
        };
        superBox.contentBoxes.push(cborBox);

        assertion.readFromJUMBF(superBox, new Claim());
        assert.equal(assertion.algorithm, 'SHA-256');
        assert.equal(assertion.name, 'Test BMFF Hash');
        assert.equal(assertion.exclusions.length, 1);
    });

    it('should generate a JUMBF box from the assertion', () => {
        assertion.algorithm = 'SHA-256' as HashAlgorithm;
        assertion.hash = new Uint8Array([1, 2, 3, 4]);
        assertion.name = 'Test BMFF Hash';
        assertion.exclusions = [
            {
                xpath: '/uuid',
                data: [
                    {
                        offset: 8,
                        value: new Uint8Array(BMFF.c2paBoxUserType),
                    },
                ],
            },
            { xpath: '/ftyp' },
            { xpath: '/mfra' },
        ];

        const box = assertion.generateJUMBFBox(new Claim());
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, AssertionLabels.bmffV3Hash);
    });
});
