import assert from 'node:assert/strict';
import * as bin from 'typed-binary';
import { CBORBox, SuperBox } from '../../../src/jumbf';
import { Assertion, Claim, HashedURI, IngredientAssertion, RelationshipType, ReviewCode } from '../../../src/manifest';
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
    this.timeout(0);

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
        const reader = new bin.BufferReader(buffer, { endianness: 'big' });
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
        if (!superBox) this.skip();

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
        if (!assertion) this.skip();

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

        const original = new IngredientAssertion();
        original.title = 'image 1.jpg';
        original.format = 'image/jpeg';
        original.instanceID = 'xmp.iid:7b57930e-2f23-47fc-affe-0400d70b738d';
        original.documentID = 'xmp.did:87d51599-286e-43b2-9478-88c79f49c347';
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

        const original = new IngredientAssertion();
        original.title = 'image 1.jpg';
        original.format = 'image/jpeg';
        original.instanceID = 'xmp.iid:7b57930e-2f23-47fc-affe-0400d70b738d';
        original.documentID = 'xmp.did:87d51599-286e-43b2-9478-88c79f49c347';
        original.metadata = metadata;
        original.relationship = RelationshipType.ComponentOf;

        const assertion = original.generateJUMBFBox(claim);
        const restored = new IngredientAssertion();
        restored.readFromJUMBF(assertion, claim);

        assert.deepEqual(restored.metadata, metadata);
    });
});
