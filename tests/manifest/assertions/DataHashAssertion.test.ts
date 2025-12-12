import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { CBORBox, SuperBox } from '../../../src/jumbf';
import { Assertion, Claim, DataHashAssertion } from '../../../src/manifest';
import * as raw from '../../../src/manifest/rawTypes';
import { BinaryHelper } from '../../../src/util';

describe('DataHashAssertion Tests', function () {
    const claim = new Claim();

    const serializedString =
        '000000ab6a756d62000000286a756d6463626f7200110010800000aa00389b7103633270612e686173682e64617461000000007b63626f72a56a6578636c7573696f6e7381a265737461727414666c656e67746819c7ba646e616d656e6a756d6266206d616e696665737463616c6766736861323536646861736858205b9361f6f790e98c2b95db7d89cc378c7bfd3326eae4e4dbe3c6b9b40c55e6896370616449000000000000000000';

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
        assert.equal(box.descriptionBox.label, 'c2pa.hash.data');
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.cborAssertion);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);
        assert.deepEqual(box.contentBoxes[0].content, {
            exclusions: [
                {
                    start: 20,
                    length: 51130,
                },
            ],
            name: 'jumbf manifest',
            alg: 'sha256',
            hash: new Uint8Array([
                91, 147, 97, 246, 247, 144, 233, 140, 43, 149, 219, 125, 137, 204, 55, 140, 123, 253, 51, 38, 234, 228,
                228, 219, 227, 198, 185, 180, 12, 85, 230, 137,
            ]),
            pad: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0]),
        });
        superBox = box;
    });

    let assertion: Assertion;
    it('construct an assertion from the JUMBF box', function () {
        if (!superBox) return;

        const dataHashAssertion = new DataHashAssertion();

        dataHashAssertion.readFromJUMBF(superBox, claim);

        assert.equal(dataHashAssertion.sourceBox, superBox);
        assert.equal(dataHashAssertion.label, 'c2pa.hash.data');
        assert.deepEqual(dataHashAssertion.uuid, raw.UUIDs.cborAssertion);
        assert.equal(dataHashAssertion.algorithm, 'SHA-256');
        assert.equal(dataHashAssertion.name, 'jumbf manifest');
        assert.equal(dataHashAssertion.hash?.length, 32);
        assert.equal(dataHashAssertion.exclusions.length, 1);

        assertion = dataHashAssertion;
    });

    it('construct a JUMBF box from the assertion', function () {
        if (!assertion) return;

        const box = assertion.generateJUMBFBox(claim);

        // check that the source box was regenerated
        assert.notEqual(box, superBox);
        assert.equal(box, assertion.sourceBox);

        // verify box content
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, 'c2pa.hash.data');
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.cborAssertion);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);
        assert.deepEqual(box.contentBoxes[0].content, {
            exclusions: [
                {
                    start: 20,
                    length: 51130,
                },
            ],
            name: 'jumbf manifest',
            alg: 'sha256',
            hash: new Uint8Array([
                91, 147, 97, 246, 247, 144, 233, 140, 43, 149, 219, 125, 137, 204, 55, 140, 123, 253, 51, 38, 234, 228,
                228, 219, 227, 198, 185, 180, 12, 85, 230, 137,
            ]),
            pad: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0]),
        });
    });
});
