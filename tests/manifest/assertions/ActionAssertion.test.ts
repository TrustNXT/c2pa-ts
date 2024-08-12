import assert from 'node:assert/strict';
import * as bin from 'typed-binary';
import { CBORBox, SuperBox } from '../../../src/jumbf';
import { ActionAssertion, Assertion, Claim } from '../../../src/manifest';
import * as raw from '../../../src/manifest/rawTypes';
import { BinaryHelper } from '../../../src/util';

describe('ActionAssertion Tests', function () {
    this.timeout(0);

    const claim = new Claim();

    const serializedString =
        '000000846a756d62000000266a756d6463626f7200110010800000aa00389b7103633270612e616374696f6e73000000005663626f72a167616374696f6e7382a166616374696f6e6c633270612e63726561746564a266616374696f6e6c633270612e64726177696e676a706172616d6574657273a1646e616d65686772616469656e74';

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
        assert.equal(box.descriptionBox.label, 'c2pa.actions');
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.cborAssertion);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);
        assert.deepEqual(box.contentBoxes[0].content, {
            actions: [
                {
                    action: 'c2pa.created',
                },
                {
                    action: 'c2pa.drawing',
                    parameters: {
                        name: 'gradient',
                    },
                },
            ],
        });

        superBox = box;
    });

    let assertion: Assertion;
    it('construct an assertion from the JUMBF box', function () {
        if (!superBox) this.skip();

        const actionAssertion = new ActionAssertion();

        actionAssertion.readFromJUMBF(superBox, claim);

        assert.equal(actionAssertion.sourceBox, superBox);
        assert.equal(actionAssertion.label, 'c2pa.actions');
        assert.deepEqual(actionAssertion.uuid, raw.UUIDs.cborAssertion);
        assert.equal(actionAssertion.actions.length, 2);
        assert.deepEqual(actionAssertion.actions[0], {
            action: 'c2pa.created',
            reason: undefined,
            instanceID: undefined,
            parameters: undefined,
            digitalSourceType: undefined,
        });
        assert.deepEqual(actionAssertion.actions[1], {
            action: 'c2pa.drawing',
            reason: undefined,
            instanceID: undefined,
            parameters: {
                name: 'gradient',
                ingredients: [],
                ingredient: undefined,
            },
            digitalSourceType: undefined,
        });

        assertion = actionAssertion;
    });

    it('construct a JUMBF box from the assertion', function () {
        if (!assertion) this.skip();

        const box = assertion.generateJUMBFBox(claim);

        // check that the source box was regenerated
        assert.notEqual(box, superBox);
        assert.equal(box, assertion.sourceBox);

        // verify box content
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, 'c2pa.actions');
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.cborAssertion);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);
        assert.deepEqual(box.contentBoxes[0].content, {
            actions: [
                {
                    action: 'c2pa.created',
                },
                {
                    action: 'c2pa.drawing',
                    parameters: {
                        name: 'gradient',
                    },
                },
            ],
        });
    });
});
