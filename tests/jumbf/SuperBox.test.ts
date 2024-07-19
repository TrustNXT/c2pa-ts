import assert from 'node:assert/strict';
import * as bin from 'typed-binary';
import { DescriptionBox, JSONBox, SuperBox } from '../../src/jumbf';
import { BinaryHelper } from '../../src/util';

describe('SuperBox Tests', function () {
    this.timeout(0);

    describe('Empty', function () {
        const uuidString = '6332637300110010800000aa00389b71';
        const serializedString = '000000216a756d62000000196a756d646332637300110010800000aa00389b7100';

        it('serialization', async function () {
            const box = new SuperBox();
            box.descriptionBox = new DescriptionBox();
            box.descriptionBox.uuid = BinaryHelper.fromHexString(uuidString);

            // fetch schema from the box
            const schema = box.schema;

            // write the box to a buffer
            const length = schema.measure(box).size;
            const buffer = Buffer.alloc(length);
            const writer = new bin.BufferWriter(buffer, { endianness: 'big' });
            schema.write(writer, box);

            // verify that the expected buffer size was also used
            assert.equal(buffer.length, writer.currentByteOffset, 'produced number of bytes differs');

            // verify expected buffer contents
            assert.equal(BinaryHelper.toHexString(buffer), serializedString);
        });

        it('deserialization', async function () {
            const buffer = BinaryHelper.fromHexString(serializedString);

            // fetch schema from the box class
            const schema = SuperBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(buffer, { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof SuperBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.descriptionBox);
            assert.ok(box.descriptionBox.uuid);
            assert.equal(BinaryHelper.toHexString(box.descriptionBox.uuid), uuidString);
            assert.ok(box.rawContent);
            assert.equal(BinaryHelper.toHexString(box.rawContent), serializedString.slice(8 * 2));
            assert.equal(box.contentBoxes.length, 0);
        });
    });

    describe('With nested JSON box', function () {
        const uuidString = '6a736f6e00110010800000aa00389b71';
        const nestedData = { key: 'value' };
        const serializedString =
            '000000386a756d62000000196a756d646a736f6e00110010800000aa00389b7100000000176a736f6e7b226b6579223a2276616c7565227d';

        it('serialization', async function () {
            const box = new SuperBox();
            box.descriptionBox = new DescriptionBox();
            box.descriptionBox.uuid = BinaryHelper.fromHexString(uuidString);

            const nestedBox = new JSONBox();
            nestedBox.content = nestedData;
            box.contentBoxes.push(nestedBox);

            // fetch schema from the box
            const schema = box.schema;

            // write the box to a buffer
            const length = schema.measure(box).size;
            const buffer = Buffer.alloc(length);
            const writer = new bin.BufferWriter(buffer, { endianness: 'big' });
            schema.write(writer, box);

            // verify that the expected buffer size was also used
            assert.equal(buffer.length, writer.currentByteOffset, 'produced number of bytes differs');

            // verify expected buffer contents
            assert.equal(BinaryHelper.toHexString(buffer), serializedString);
        });

        it('deserialization', async function () {
            const buffer = BinaryHelper.fromHexString(serializedString);

            // fetch schema from the box class
            const schema = SuperBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(buffer, { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof SuperBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.descriptionBox);
            assert.ok(box.descriptionBox.uuid);
            assert.equal(BinaryHelper.toHexString(box.descriptionBox.uuid), uuidString);
            assert.ok(box.rawContent);
            assert.equal(BinaryHelper.toHexString(box.rawContent), serializedString.slice(8 * 2));

            // validate nested box
            assert.equal(box.contentBoxes.length, 1);
            const nestedBox = box.contentBoxes[0];
            if (!(nestedBox instanceof JSONBox)) assert.fail('resulting nested box has wrong type');
            assert.equal(JSON.stringify(nestedBox.content), JSON.stringify(nestedData));
        });
    });
});
