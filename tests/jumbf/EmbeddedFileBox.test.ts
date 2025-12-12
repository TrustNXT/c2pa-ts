import assert from 'assert';
import { describe, it } from 'bun:test';
import * as bin from 'typed-binary';
import { EmbeddedFileBox } from '../../src/jumbf';
import { BinaryHelper } from '../../src/util';

describe('EmbeddedFileBox Tests', function () {
    describe('Empty', function () {
        const serializedString = '0000000862696462';

        it('serialization', async function () {
            const box = new EmbeddedFileBox();

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
            const schema = EmbeddedFileBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof EmbeddedFileBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.content);
            assert.equal(box.content.length, 0);
        });
    });

    describe('Not Empty', function () {
        const contentString = '6332637300110010800000aa00389b71';
        const serializedString = '00000018626964626332637300110010800000aa00389b71';

        it('serialization', async function () {
            const box = new EmbeddedFileBox();
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
            const schema = EmbeddedFileBox.schema;

            // read the box from the buffer
            const reader = new bin.BufferReader(BinaryHelper.toArrayBuffer(buffer), { endianness: 'big' });
            const box = schema.read(reader);

            // verify that the expected buffer size was also used
            assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

            // validate resulting box
            if (!(box instanceof EmbeddedFileBox)) assert.fail('resulting box has wrong type');
            assert.ok(box.content);
            assert.equal(BinaryHelper.toHexString(box.content), contentString);
        });
    });
});
