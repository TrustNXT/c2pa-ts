/* eslint-disable @typescript-eslint/dot-notation */
import assert from 'node:assert/strict';
import { BMFF, BMFFBox } from '../../../src/asset';
import { HashAlgorithm } from '../../../src/crypto/types';
import { CBORBox, DescriptionBox, SuperBox } from '../../../src/jumbf';
import { BMFFHashAssertion, Claim, ValidationStatusCode } from '../../../src/manifest';
import { AssertionLabels } from '../../../src/manifest/assertions/AssertionLabels';
import * as raw from '../../../src/manifest/rawTypes';

function createBMFFMock(): Uint8Array {
    /* prettier-ignore */
    const bmffHeader = new Uint8Array([
        0x00, 0x00, 0x00, 0x18, // Box size (24 bytes)
        0x66, 0x74, 0x79, 0x70, // Box type 'ftyp'
        0x68, 0x65, 0x69, 0x63, // Major brand 'heic'
        0x00, 0x00, 0x00, 0x01, // Minor version
        0x68, 0x65, 0x69, 0x63, // Compatible brands 'heic'
        0x6d, 0x69, 0x66, 0x31  // Compatible brands 'mif1'
    ]);

    return bmffHeader;
}

describe('BMFFHashAssertion Tests', function () {
    this.timeout(0);

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
        assertion.exclusions = [{ xpath: '/uuid' }, { xpath: '/ftyp' }];

        const box = assertion.generateJUMBFBox(new Claim());

        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, AssertionLabels.bmffV3Hash);
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.cborAssertion);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);

        const content = box.contentBoxes[0].content as {
            exclusions: { xpath: string }[];
            alg: string;
            hash: Uint8Array;
            name: string;
        };

        assert.equal(content.exclusions.length, 2);
        assert.equal(content.exclusions[0].xpath, '/uuid');
        assert.equal(content.exclusions[1].xpath, '/ftyp');
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
});
