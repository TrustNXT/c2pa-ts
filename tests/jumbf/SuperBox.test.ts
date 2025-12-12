import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { DescriptionBox, JSONBox, SuperBox } from '../../src/jumbf';
import { BinaryHelper } from '../../src/util';

describe('SuperBox Tests', function () {
    describe('Empty', function () {
        const uuidString = '6332637300110010800000aa00389b71';
        const descriptionLabel = 'test.superbox';
        const serializedString =
            '0000002f6a756d62000000276a756d646332637300110010800000aa00389b7103746573742e7375706572626f7800';
        const uri = 'self#jumbf=/test.superbox';

        it('serialization', async function () {
            const box = new SuperBox();
            box.descriptionBox = new DescriptionBox();
            box.descriptionBox.uuid = BinaryHelper.fromHexString(uuidString);
            box.descriptionBox.label = descriptionLabel;

            // fetch schema from the box
            const schema = box.schema;

            // write the box to a buffer
            const length = schema.measure(box).size;
            const buffer = new Uint8Array(length);
            const writer = new bin.BufferWriter(buffer.buffer, { endianness: 'big' });
            schema.write(writer, box);

            // verify that the expected buffer size was also used
            assert.equal(buffer.length, writer.currentByteOffset, 'produced number of bytes differs');

            // verify expected buffer contents
            assert.equal(BinaryHelper.toHexString(buffer), serializedString);

            // validate generating the raw content buffer
            const rawContent = box.toBuffer();
            assert.ok(rawContent);
            assert.equal(box.rawContent, rawContent);
            assert.equal(BinaryHelper.toHexString(box.rawContent), serializedString.slice(8 * 2));
        });

        it('deserialization', async function () {
            const buffer = BinaryHelper.fromHexString(serializedString);

            // fetch schema from the box class
            const schema = SuperBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof SuperBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.descriptionBox);
            assert.ok(box.descriptionBox.uuid);
            assert.equal(BinaryHelper.toHexString(box.descriptionBox.uuid), uuidString);
            assert.ok(box.descriptionBox.requestable);
            assert.ok(box.descriptionBox.label);
            assert.equal(box.descriptionBox.label, descriptionLabel);
            assert.ok(box.rawContent);
            assert.equal(BinaryHelper.toHexString(box.rawContent), serializedString.slice(8 * 2));
            assert.equal(box.contentBoxes.length, 0);
        });

        it('deserialization from buffer', async function () {
            const buffer = BinaryHelper.fromHexString(serializedString);

            // read the box from the buffer
            const box = SuperBox.fromBuffer(buffer);

            // validate resulting box
            if (!(box instanceof SuperBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.descriptionBox);
            assert.ok(box.descriptionBox.uuid);
            assert.equal(BinaryHelper.toHexString(box.descriptionBox.uuid), uuidString);
            assert.ok(box.descriptionBox.requestable);
            assert.ok(box.descriptionBox.label);
            assert.equal(box.descriptionBox.label, descriptionLabel);
            assert.ok(box.rawContent);
            assert.equal(BinaryHelper.toHexString(box.rawContent), serializedString.slice(8 * 2));
            assert.equal(box.contentBoxes.length, 0);
            assert.equal(box.uri, uri);
        });
    });

    describe('With nested JSON box', function () {
        const uuidString = '6a736f6e00110010800000aa00389b71';
        const descriptionLabel = 'test.superbox';
        const nestedData = { key: 'value' };
        const serializedString =
            '000000466a756d62000000276a756d646a736f6e00110010800000aa00389b7103746573742e7375706572626f7800000000176a736f6e7b226b6579223a2276616c7565227d';
        const uri = 'self#jumbf=/test.superbox';

        it('serialization', async function () {
            const box = new SuperBox();
            box.descriptionBox = new DescriptionBox();
            box.descriptionBox.uuid = BinaryHelper.fromHexString(uuidString);
            box.descriptionBox.label = descriptionLabel;

            const nestedBox = new JSONBox();
            nestedBox.content = nestedData;
            box.contentBoxes.push(nestedBox);

            // fetch schema from the box
            const schema = box.schema;

            // write the box to a buffer
            const length = schema.measure(box).size;
            const buffer = new Uint8Array(length);
            const writer = new bin.BufferWriter(buffer.buffer, { endianness: 'big' });
            schema.write(writer, box);

            // verify that the expected buffer size was also used
            assert.equal(buffer.length, writer.currentByteOffset, 'produced number of bytes differs');

            // verify expected buffer contents
            assert.equal(BinaryHelper.toHexString(buffer), serializedString);

            // validate generating the raw content buffer
            const rawContent = box.toBuffer();
            assert.ok(rawContent);
            assert.equal(box.rawContent, rawContent);
            assert.equal(BinaryHelper.toHexString(box.rawContent), serializedString.slice(8 * 2));
        });

        it('deserialization', async function () {
            const buffer = BinaryHelper.fromHexString(serializedString);

            // fetch schema from the box class
            const schema = SuperBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof SuperBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.descriptionBox);
            assert.ok(box.descriptionBox.uuid);
            assert.equal(BinaryHelper.toHexString(box.descriptionBox.uuid), uuidString);
            assert.ok(box.descriptionBox.requestable);
            assert.ok(box.descriptionBox.label);
            assert.equal(box.descriptionBox.label, descriptionLabel);
            assert.ok(box.rawContent);
            assert.equal(BinaryHelper.toHexString(box.rawContent), serializedString.slice(8 * 2));

            // validate nested box
            assert.equal(box.contentBoxes.length, 1);
            const nestedBox = box.contentBoxes[0];
            if (!(nestedBox instanceof JSONBox)) assert.fail('resulting nested box has wrong type');
            assert.equal(JSON.stringify(nestedBox.content), JSON.stringify(nestedData));
        });

        it('deserialization from buffer', async function () {
            const buffer = BinaryHelper.fromHexString(serializedString);

            // read the box from the buffer
            const box = SuperBox.fromBuffer(buffer);

            // validate resulting box
            if (!(box instanceof SuperBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.descriptionBox);
            assert.ok(box.descriptionBox.uuid);
            assert.equal(BinaryHelper.toHexString(box.descriptionBox.uuid), uuidString);
            assert.ok(box.descriptionBox.requestable);
            assert.ok(box.descriptionBox.label);
            assert.equal(box.descriptionBox.label, descriptionLabel);
            assert.ok(box.rawContent);
            assert.equal(BinaryHelper.toHexString(box.rawContent), serializedString.slice(8 * 2));

            // validate nested box
            assert.equal(box.contentBoxes.length, 1);
            const nestedBox = box.contentBoxes[0];
            if (!(nestedBox instanceof JSONBox)) assert.fail('resulting nested box has wrong type');
            assert.equal(JSON.stringify(nestedBox.content), JSON.stringify(nestedData));
            assert.equal(box.uri, uri);
        });
    });
});
