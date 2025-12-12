import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { CBORBox, SuperBox } from '../../../src/jumbf';
import {
    Assertion,
    Claim,
    HashedURI,
    IngredientAssertion,
    RelationshipType,
    ReviewCode,
    ValidationStatusCode,
} from '../../../src/manifest';
import * as raw from '../../../src/manifest/rawTypes';
import { BinaryHelper } from '../../../src/util';

// Helper function to create a HashedURI
function createHashedUri(uri: string): HashedURI {
    return {
        uri,
        hash: new Uint8Array(32), // Placeholder hash
        algorithm: 'SHA-256',
    };
}

describe('IngredientAssertion Tests', function () {
    const claim = new Claim();
    claim.defaultAlgorithm = 'SHA-256';

    // taken from adobe-20220124-CA.jpg.jumbf.text
    const serializedString =
        '000001576a756d62000000296a756d6463626f7200110010800000aa00389b7103633270612e696e6772656469656e74000000012663626f72a66864633a7469746c6565412e6a70676964633a666f726d61746a696d6167652f6a7065676a646f63756d656e744944782c786d702e6469643a38313365653432322d393733362d346364632d396265362d3465333565643865343163626a696e7374616e63654944782c786d702e6969643a38313365653432322d393733362d346364632d396265362d3465333565643865343163626c72656c6174696f6e7368697068706172656e744f66697468756d626e61696ca26375726c783973656c66236a756d62663d633270612e617373657274696f6e732f633270612e7468756d626e61696c2e696e6772656469656e742e6a70656764686173685820cf9e5b46a152bff1dd42516953de8050fc039c73168bf5d555a9de74a13b9317';

    const thumbnailHash = new Uint8Array([
        207, 158, 91, 70, 161, 82, 191, 241, 221, 66, 81, 105, 83, 222, 128, 80, 252, 3, 156, 115, 22, 139, 245, 213,
        85, 169, 222, 116, 161, 59, 147, 23,
    ]);

    let superBox: SuperBox;
    it('read a JUMBF box', function () {
        const buffer = BinaryHelper.fromHexString(serializedString);

        // fetch schema from the box class
        const schema = SuperBox.schema;

        // read the box from the buffer
        const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
        const box = schema.read(reader);
        assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

        // verify box content
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, 'c2pa.ingredient');
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.cborAssertion);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);
        assert.deepEqual(box.contentBoxes[0].content, {
            'dc:title': 'A.jpg',
            'dc:format': 'image/jpeg',
            documentID: 'xmp.did:813ee422-9736-4cdc-9be6-4e35ed8e41cb',
            instanceID: 'xmp.iid:813ee422-9736-4cdc-9be6-4e35ed8e41cb',
            relationship: 'parentOf',
            thumbnail: {
                url: 'self#jumbf=c2pa.assertions/c2pa.thumbnail.ingredient.jpeg',
                hash: thumbnailHash,
            },
        });
        superBox = box;
    });

    let assertion: Assertion;
    it('construct an assertion from the JUMBF box', function () {
        if (!superBox) return;

        const ingredientAssertion = new IngredientAssertion();

        ingredientAssertion.readFromJUMBF(superBox, claim);

        assert.equal(ingredientAssertion.sourceBox, superBox);
        assert.equal(ingredientAssertion.label, 'c2pa.ingredient');
        assert.deepEqual(ingredientAssertion.uuid, raw.UUIDs.cborAssertion);
        assert.equal(ingredientAssertion.title, 'A.jpg');
        assert.equal(ingredientAssertion.format, 'image/jpeg');
        assert.equal(ingredientAssertion.documentID, 'xmp.did:813ee422-9736-4cdc-9be6-4e35ed8e41cb');
        assert.equal(ingredientAssertion.instanceID, 'xmp.iid:813ee422-9736-4cdc-9be6-4e35ed8e41cb');
        assert.equal(ingredientAssertion.relationship, 'parentOf');
        assert.equal(ingredientAssertion.activeManifest, undefined);
        assert.deepEqual(ingredientAssertion.thumbnail, {
            uri: 'self#jumbf=c2pa.assertions/c2pa.thumbnail.ingredient.jpeg',
            hash: thumbnailHash,
            algorithm: 'SHA-256',
        } as HashedURI);

        assertion = ingredientAssertion;
    });

    it('construct a JUMBF box from the assertion', function () {
        if (!assertion) return;

        const box = assertion.generateJUMBFBox(claim);

        // check that the source box was regenerated
        assert.notEqual(box, superBox);
        assert.equal(box, assertion.sourceBox);

        // verify box content
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, 'c2pa.ingredient');
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.cborAssertion);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);
        assert.deepEqual(box.contentBoxes[0].content, {
            'dc:title': 'A.jpg',
            'dc:format': 'image/jpeg',
            documentID: 'xmp.did:813ee422-9736-4cdc-9be6-4e35ed8e41cb',
            instanceID: 'xmp.iid:813ee422-9736-4cdc-9be6-4e35ed8e41cb',
            relationship: 'parentOf',
            thumbnail: {
                url: 'self#jumbf=c2pa.assertions/c2pa.thumbnail.ingredient.jpeg',
                hash: thumbnailHash,
            },
        });
    });

    it('should read and write a simple ingredient assertion (v1)', () => {
        const claim = new Claim();
        claim.defaultAlgorithm = 'SHA-256';

        const original = IngredientAssertion.create(
            'image 1.jpg',
            'image/jpeg',
            'xmp.iid:7b57930e-2f23-47fc-affe-0400d70b738d',
            'xmp.did:87d51599-286e-43b2-9478-88c79f49c347',
        );
        original.thumbnail = createHashedUri('#c2pa.ingredient.thumbnail.jpeg');
        original.relationship = RelationshipType.ComponentOf;

        const assertion = original.generateJUMBFBox(claim);
        const restored = new IngredientAssertion();
        restored.readFromJUMBF(assertion, claim);

        assert.equal(restored.title, original.title);
        assert.equal(restored.format, original.format);
        assert.equal(restored.documentID, original.documentID);
        assert.equal(restored.instanceID, original.instanceID);
        assert.deepEqual(restored.thumbnail, original.thumbnail);
    });

    it('should handle reviews in ingredient assertion', () => {
        const claim = new Claim();
        claim.defaultAlgorithm = 'SHA-256';

        const reviewRating = {
            value: 1,
            explanation: 'a 3rd party plugin was used',
            code: ReviewCode.ActionsUnknownActionsPerformed,
        };
        const metadata: raw.AssertionMetadataMap = {
            dateTime: new Date().toISOString(),
            reviewRatings: [reviewRating],
        };

        const original = IngredientAssertion.create(
            'image 1.jpg',
            'image/jpeg',
            'xmp.iid:7b57930e-2f23-47fc-affe-0400d70b738d',
            'xmp.did:87d51599-286e-43b2-9478-88c79f49c347',
        );
        original.metadata = metadata;
        original.relationship = RelationshipType.ComponentOf;

        const assertion = original.generateJUMBFBox(claim);
        const restored = new IngredientAssertion();
        restored.readFromJUMBF(assertion, claim);

        assert.deepEqual(restored.metadata, metadata);
    });

    it('should test version-specific serialization', () => {
        const claim = new Claim();
        claim.defaultAlgorithm = 'SHA-256';

        // Create validation status
        const validationStatus = [ValidationStatusCode.ClaimSignatureValidated];

        // Create validation results
        const activeManifestCodes = {
            success: [
                {
                    code: ValidationStatusCode.ClaimSignatureValidated,
                    url: 'self#jumbf=c2pa/urn:c2pa:5E7B01FC-4932-4BAB-AB32-D4F12A8AA322/c2pa.signature',
                },
            ],
            informational: [
                {
                    code: ValidationStatusCode.SigningCredentialOCSPSkipped,
                    url: 'self#jumbf=c2pa/urn:c2pa:5E7B01FC-4932-4BAB-AB32-D4F12A8AA322/c2pa.signature',
                },
            ],
            failure: [],
        };

        const ingredientDeltas = {
            ingredientAssertionURI:
                'self#jumbf=c2pa/urn:c2pa:5E7B01FC-4932-4BAB-AB32-D4F12A8AA322/c2pa.assertions/c2pa.ingredient.v3',
            validationDeltas: {
                success: [],
                informational: [],
                failure: [
                    {
                        code: ValidationStatusCode.AssertionHashedURIMismatch,
                        url: 'self#jumbf=c2pa/urn:c2pa:F095F30E-6CD5-4BF7-8C44-CE8420CA9FB7/c2pa.assertions/c2pa.metadata',
                    },
                ],
            },
        };

        const validationResults = {
            activeManifest: activeManifestCodes,
            ingredientDeltas: [ingredientDeltas],
        };

        // Create metadata
        const metadata = {
            dateTime: '2021-06-28T16:49:32.874Z',
            reviewRatings: [
                {
                    value: 5,
                    explanation: 'Content bindings validated',
                },
            ],
        };

        // Create data types
        const dataTypes = [
            {
                type: 'generatorPrompt',
                value: '1.0.0',
            },
        ];

        // Create base ingredient with all values
        const allVals = new IngredientAssertion();
        allVals.title = 'test_title';
        allVals.format = 'image/jpg';
        allVals.documentID = '12345';
        allVals.instanceID = '67890';
        allVals.c2pa_manifest = createHashedUri('self#jumbf=c2pa/urn:c2pa:5E7B01FC-4932-4BAB-AB32-D4F12A8AA322');
        allVals.validationStatus = validationStatus;
        allVals.relationship = RelationshipType.ParentOf;
        allVals.thumbnail = createHashedUri(
            'self#jumbf=c2pa/urn:c2pa:5E7B01FC-4932-4BAB-AB32-D4F12A8AA322/c2pa.thumbnail.ingredient_1.jpg',
        );
        allVals.metadata = metadata;
        allVals.data = createHashedUri(
            'self#jumbf=c2pa/urn:c2pa:5E7B01FC-4932-4BAB-AB32-D4F12A8AA322/c2pa.databoxes/c2pa.data',
        );
        allVals.description = 'Some ingredient description';
        allVals.informationalURI = 'https://tfhub.dev/deepmind/bigbigan-resnet50/1';
        allVals.dataTypes = dataTypes;
        allVals.validationResults = validationResults;
        allVals.activeManifest = createHashedUri('self#jumbf=c2pa/urn:c2pa:5E7B01FC-4932-4BAB-AB32-D4F12A8AA322');
        allVals.claimSignature = createHashedUri(
            'self#jumbf=c2pa/urn:c2pa:5E7B01FC-4932-4BAB-AB32-D4F12A8AA322/c2pa.signature',
        );

        // Test V1
        allVals.version = 1;
        const v1Box = allVals.generateJUMBFBox(claim);
        const v1Decoded = new IngredientAssertion();
        v1Decoded.readFromJUMBF(v1Box, claim);

        // V1 expected values
        assert.equal(v1Decoded.title, 'test_title');
        assert.equal(v1Decoded.format, 'image/jpg');
        assert.equal(v1Decoded.documentID, '12345');
        assert.equal(v1Decoded.instanceID, '67890');
        assert.deepEqual(v1Decoded.c2pa_manifest, allVals.c2pa_manifest);
        assert.deepEqual(v1Decoded.validationStatus, validationStatus);
        assert.equal(v1Decoded.relationship, RelationshipType.ParentOf);
        assert.deepEqual(v1Decoded.thumbnail, allVals.thumbnail);
        assert.deepEqual(v1Decoded.metadata, metadata);
        assert.equal(v1Decoded.data, undefined);
        assert.equal(v1Decoded.description, undefined);
        assert.equal(v1Decoded.informationalURI, undefined);
        assert.equal(v1Decoded.dataTypes, undefined);
        assert.equal(v1Decoded.validationResults, undefined);
        assert.equal(v1Decoded.activeManifest, undefined);
        assert.equal(v1Decoded.claimSignature, undefined);
        assert.ok(v1Decoded.isV1Compatible());
        assert.ok(v1Decoded.isV2Compatible());
        assert.ok(!v1Decoded.isV3Compatible());

        // Test V2
        allVals.version = 2;
        const v2Box = allVals.generateJUMBFBox(claim);
        const v2Decoded = new IngredientAssertion();
        v2Decoded.readFromJUMBF(v2Box, claim);

        // V2 expected values
        assert.equal(v2Decoded.title, 'test_title');
        assert.equal(v2Decoded.format, 'image/jpg');
        assert.equal(v2Decoded.documentID, '12345');
        assert.equal(v2Decoded.instanceID, '67890');
        assert.deepEqual(v2Decoded.thumbnail, allVals.thumbnail);
        assert.deepEqual(v2Decoded.metadata, metadata);
        assert.deepEqual(v2Decoded.data, allVals.data);
        assert.equal(v2Decoded.description, 'Some ingredient description');
        assert.equal(v2Decoded.informationalURI, 'https://tfhub.dev/deepmind/bigbigan-resnet50/1');
        assert.deepEqual(v2Decoded.dataTypes, dataTypes);
        assert.equal(v2Decoded.validationResults, undefined);
        assert.equal(v2Decoded.activeManifest, undefined);
        assert.equal(v2Decoded.claimSignature, undefined);
        assert.ok(!v2Decoded.isV1Compatible());
        assert.ok(v2Decoded.isV2Compatible());
        assert.ok(!v2Decoded.isV3Compatible());

        // Test V3
        allVals.version = 3;
        const v3Box = allVals.generateJUMBFBox(claim);
        const v3Decoded = new IngredientAssertion();
        v3Decoded.readFromJUMBF(v3Box, claim);

        // V3 expected values
        assert.equal(v3Decoded.title, 'test_title');
        assert.equal(v3Decoded.format, 'image/jpg');
        assert.equal(v3Decoded.documentID, undefined);
        assert.equal(v3Decoded.instanceID, '67890');
        assert.equal(v3Decoded.relationship, RelationshipType.ParentOf);
        assert.deepEqual(v3Decoded.thumbnail, allVals.thumbnail);
        assert.deepEqual(v3Decoded.metadata, metadata);
        assert.deepEqual(v3Decoded.data, allVals.data);
        assert.equal(v3Decoded.description, 'Some ingredient description');
        assert.equal(v3Decoded.informationalURI, 'https://tfhub.dev/deepmind/bigbigan-resnet50/1');
        assert.deepEqual(v3Decoded.dataTypes, dataTypes);
        assert.deepEqual(v3Decoded.validationResults, validationResults);
        assert.deepEqual(v3Decoded.activeManifest, allVals.activeManifest);
        assert.deepEqual(v3Decoded.claimSignature, allVals.claimSignature);
        assert.ok(!v3Decoded.isV1Compatible());
        assert.ok(!v3Decoded.isV2Compatible());
        assert.ok(v3Decoded.isV3Compatible());
    });
});
