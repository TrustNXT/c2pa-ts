import assert from 'assert';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { CBORBox } from '../../src/jumbf';
import { BinaryHelper } from '../../src/util';

describe('CBORBox Tests', function () {
    describe('Empty', function () {
        const serializedString = '0000000963626f72f7';

        it('serialization', async function () {
            const box = new CBORBox();

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
            const schema = CBORBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof CBORBox)) assert.fail('resulting box has wrong type');
            assert.equal(box.content, undefined);
            assert.ok(box.rawContent);
            assert.equal(box.rawContent.length, 1);
        });
    });

    describe('Simple Dict', function () {
        // Note: cbor-js encodes the dict as 'a1616101' while cbor-x uses 'b90001616101'
        const serializedString = '0000000e63626f72b90001616101';

        it('serialization', async function () {
            const box = new CBORBox();
            box.content = { a: 1 };

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
            const schema = CBORBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof CBORBox)) assert.fail('resulting box has wrong type');
            assert.equal(JSON.stringify(box.content), JSON.stringify({ a: 1 }));
            assert.ok(box.rawContent);
            assert.equal(box.rawContent.length, 6);
        });
    });

    describe('Tagged Value', function () {
        const serializedString = '0000000f63626f72d8641a66a4e9f1';
        const tag = 100;
        const content = 1722083825;

        it('serialization', async function () {
            const box = new CBORBox();
            box.tag = tag;
            box.content = content;

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
            const schema = CBORBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof CBORBox)) assert.fail('resulting box has wrong type');
            assert.equal(box.tag, tag);
            assert.equal(box.content, content);
            assert.ok(box.rawContent);
            assert.equal(box.rawContent.length, 7);
        });
    });
});
