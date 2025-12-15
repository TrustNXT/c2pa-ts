import assert from 'assert';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { UUIDBox } from '../../src/jumbf/UUIDBox';
import { BinaryHelper } from '../../src/util';

describe('UUIDBox Tests', function () {
    describe('Minimal', function () {
        const uuidString = '6332637300110010800000aa00389b71';
        const serializedString = '00000018757569646332637300110010800000aa00389b71';

        it('serialization', async function () {
            const box = new UUIDBox();
            box.uuid = BinaryHelper.fromHexString(uuidString);
            box.content = new Uint8Array();

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
        });

        // Special case for empty content
        // This wouldn't be needed if `content` wasn't allowed to be
        // `undefined` which should perhaps be changed (TODO).
        it('serialization with undefined content', async function () {
            const box = new UUIDBox();
            box.uuid = BinaryHelper.fromHexString(uuidString);
            box.content = undefined;

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
        });

        it('deserialization', async function () {
            const buffer = BinaryHelper.fromHexString(serializedString);

            // fetch schema from the box class
            const schema = UUIDBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof UUIDBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.uuid);
            assert.equal(BinaryHelper.toHexString(box.uuid), uuidString);
            assert.ok(box.content);
            assert.equal(BinaryHelper.toHexString(box.content), '');
        });
    });

    describe('With Content', function () {
        const uuidString = '6332637300110010800000aa00389b71';
        const contentString = '7465737420646174610a';
        const serializedString = '00000022757569646332637300110010800000aa00389b717465737420646174610a';

        it('serialization', async function () {
            const box = new UUIDBox();
            box.uuid = BinaryHelper.fromHexString(uuidString);
            box.content = BinaryHelper.fromHexString(contentString);

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
        });

        it('deserialization', async function () {
            const buffer = BinaryHelper.fromHexString(serializedString);

            // fetch schema from the box class
            const schema = UUIDBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof UUIDBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.uuid);
            assert.equal(BinaryHelper.toHexString(box.uuid), uuidString);
            assert.ok(box.content);
            assert.equal(BinaryHelper.toHexString(box.content), contentString);
        });
    });
});
