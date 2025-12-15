import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { CBORBox, SuperBox } from '../../../src/jumbf';
import {
    ActionAssertion,
    ActionType,
    Assertion,
    AssertionLabels,
    Claim,
    DigitalSourceType,
} from '../../../src/manifest';
import * as raw from '../../../src/manifest/rawTypes';
import { BinaryHelper } from '../../../src/util';

describe('ActionAssertion Tests', function () {
    const claim = new Claim();

    const serializedStringV1 =
        '000000846a756d62000000266a756d6463626f7200110010800000aa00389b7103633270612e616374696f6e73000000005663626f72a167616374696f6e7382a166616374696f6e6c633270612e63726561746564a266616374696f6e6c633270612e64726177696e676a706172616d6574657273a1646e616d65686772616469656e74';

    let superBox: SuperBox;
    it('read a v1 JUMBF box', function () {
        const buffer = BinaryHelper.fromHexString(serializedStringV1);

        // fetch schema from the box class
        const schema = SuperBox.schema;

        // read the box from the buffer
        const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
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
    it('construct an assertion from the v1 JUMBF box', function () {
        if (!superBox) return;

        const actionAssertion = new ActionAssertion();

        actionAssertion.readFromJUMBF(superBox, claim);

        assert.equal(actionAssertion.sourceBox, superBox);
        assert.equal(actionAssertion.label, 'c2pa.actions');
        assert.deepEqual(actionAssertion.uuid, raw.UUIDs.cborAssertion);
        assert.equal(actionAssertion.actions.length, 2);
        assert.deepEqual(actionAssertion.actions[0], {
            action: 'c2pa.created',
        });
        assert.deepEqual(actionAssertion.actions[1], {
            action: 'c2pa.drawing',
            parameters: {
                name: 'gradient',
                ingredients: [],
            },
        });

        assertion = actionAssertion;
    });

    it('construct a JUMBF box from the v1 assertion', function () {
        if (!assertion) return;

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

    const constructedAssertion = new ActionAssertion();
    constructedAssertion.actions.push({
        action: ActionType.C2paOpened,
        digitalSourceType: DigitalSourceType.DigitalArt,
        reason: 'Opened the media',
        instanceID: 'Dummy-Instance-ID',
    });

    it('create and read back a v2 assertion', function () {
        const box = constructedAssertion.generateJUMBFBox();

        assert.equal(box.descriptionBox?.label, 'c2pa.actions.v2');
        assert.deepEqual(box.descriptionBox?.uuid, raw.UUIDs.cborAssertion);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);
        assert.deepEqual(box.contentBoxes[0].content, {
            actions: [
                {
                    action: 'c2pa.opened',
                    digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalArt',
                    reason: 'Opened the media',
                },
            ],
        });

        const readBackAssertion = new ActionAssertion();
        readBackAssertion.readFromJUMBF(box, claim);

        assert.equal(readBackAssertion.label, 'c2pa.actions.v2');
        assert.deepEqual(readBackAssertion.actions[0], {
            action: ActionType.C2paOpened,
            digitalSourceType: DigitalSourceType.DigitalArt,
            reason: 'Opened the media',
        });
    });

    it('create and read back a v1 assertion', function () {
        constructedAssertion.label = AssertionLabels.actions;
        const box = constructedAssertion.generateJUMBFBox();

        assert.equal(box.descriptionBox?.label, 'c2pa.actions');
        assert.deepEqual(box.descriptionBox?.uuid, raw.UUIDs.cborAssertion);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);
        assert.deepEqual(box.contentBoxes[0].content, {
            actions: [
                {
                    action: 'c2pa.opened',
                    digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalArt',
                    instanceID: 'Dummy-Instance-ID',
                },
            ],
        });

        const readBackAssertion = new ActionAssertion();
        readBackAssertion.readFromJUMBF(box, claim);

        assert.equal(readBackAssertion.label, 'c2pa.actions');
        assert.deepEqual(readBackAssertion.actions[0], {
            action: ActionType.C2paOpened,
            digitalSourceType: DigitalSourceType.DigitalArt,
            instanceID: 'Dummy-Instance-ID',
        });
    });
});
